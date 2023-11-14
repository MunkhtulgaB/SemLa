import { initializeTooltip, 
    hideTooltip, 
    showMapTooltip,
    moveTooltipToCursor } from "./tooltip.js";
import { filterByLabels, 
        filterByDatapoint,
        calculateConfidence } from "./filters.js";
import { Filter } from "../data.js";
import { updateTextSummary,
         loadingImportanceChart,
         emptyImportanceChart,
         emptyRelationChart,
         emptyTokenChart,
         updateImportanceChartFromCache,
         updateRelationChartFromCache,
         updateTokenChartFromCache } from "../instance-level.js"; 


const symbolNames = [
    "Circle",
    "Cross",
    "Diamond",
    "Square",
    "Star",
    "Triangle",
    "Wye",
];
const symbols = symbolNames.map((name) =>
    d3.symbol().type(d3[`symbol${name}`]).size(150)
);

let customSymbolDownTriangle = {
    draw: function (context, size) {
        let s = Math.sqrt(size);
        context.moveTo(0, s / 2);
        context.lineTo(s, -s);
        context.lineTo(-s, -s);
        // context.lineTo(-s,s);
        context.closePath();
    },
};

symbols.push(d3.symbol().type(customSymbolDownTriangle).size(100));



class MapView {
    #container_id;
    #svg_canvas;
    #labels_to_points_tsne;
    #labels_to_points_umap;
    #dataset;
    #data;
    #margin;
    #width;
    #height;
    #cluster_to_color;
    #label_to_cluster;
    #model_name;
    #dataset_name;
    #num_clusters;
    #model_dataset_availability;
    #explanation_set;
    #is_in_compare_mode;
    #is_lasso_active;

    #xScale;
    #yScale;
    #xAxis;
    #yAxis;
    #dim_reduction;
    #newX;
    #newY;
    #onUpdate;
    #updateCount = 0;
    #previous_label_symbol_map = {};
    #selectedLabels;

    #parallelMap;
    #alertCount = 0;


    constructor(container_id, 
                svg_canvas, 
                margin,
                width, 
                height, 
                dataset, 
                explanation_set,
                cluster_to_color, 
                label_to_cluster,
                dim_reduction,
                onUpdate,
                onDragEnd,
                dataset_name,
                model_name,
                num_clusters,
                model_dataset_availability,
                is_in_compare_mode) {
        const data = dataset.data;
        if (dataset) dataset.addObserver(this);
        
        
        this.#container_id = container_id;
        this.#svg_canvas = svg_canvas;
        this.#dataset = dataset;
        this.#data = data;
        this.#margin = margin;
        this.#width = width;
        this.#height = height;
        this.#cluster_to_color = cluster_to_color;
        this.#label_to_cluster = label_to_cluster;
        this.#dim_reduction = dim_reduction;
        this.#onUpdate = onUpdate; 
        this.#dataset_name = dataset_name;
        this.#model_name = model_name;
        this.#num_clusters = num_clusters;
        this.#model_dataset_availability = model_dataset_availability;
        this.#explanation_set = explanation_set;
        this.#is_in_compare_mode = is_in_compare_mode;

        this.initialize();
    }

    initialize() {
        this.initializeAxes();
        this.initializeZoom();

        // Initialize dragging behaviour and label hulls
        const [labels_to_points_tsne, 
            labels_to_points_umap] = this.initializeHulls(false); // hulls for predicted groups
        this.initializeHulls(true); // hulls for ground-truth groups
        initializeTooltip("map-tooltip", "container");

        
        this.#labels_to_points_tsne = labels_to_points_tsne;
        this.#labels_to_points_umap = labels_to_points_umap;

        this.initializeDragLines();
        this.initializeDatapoints();
        this.#onUpdate();
        this.initializeLegend();
        this.initializeLassoTool();
    }

    initializeLassoTool() {
        const parent = $(`#${this.#container_id}`).parent();
        const self = this;
        parent.append(`
            <div class="lasso-tool-btn">
                <div class="lasso-icon">
                </div>
            </div>
        `)

        parent.find(".lasso-tool-btn").click(function() {
            self.toggleLassoTool();
        })
        parent.css("cursor", "alias");
    }

    toggleLassoTool() {
        if (this.#is_lasso_active) {
            this.endLassoTool();
        } else {
            this.startLassoTool();
        }
    }

    startLassoTool() {
        this.#is_lasso_active = true;
        const parent = $(`#${this.#container_id}`).parent();
        parent.css("cursor", "crosshair")
        this.pauseZoom();
        this.drawLasso();

        const self = this;
        const svg = this.#svg_canvas.node().parentNode
        
        const pt = svg.createSVGPoint()
        let transformCursorPositionToSVGSpace = function(event){
            pt.x = event.clientX; 
            pt.y = event.clientY;
            return pt.matrixTransform(
                svg.getScreenCTM().inverse()
            );
        }

        this.#svg_canvas.append("rect")
            .attr("class", "lasso-interface")
            .attr("width", this.#width)
            .attr("height", this.#height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .on("mousedown", function() {
                self.isDrawingLasso = true;
                self.lassoPoints = [];
            })
            .on("mousemove", function() {
                if (self.isDrawingLasso) {
                    const location = transformCursorPositionToSVGSpace(d3.event);
                    self.lassoPoints.push([location.x,
                                            location.y]);
                    self.drawLasso();
                    self.getSamplesInLasso();
                }
            })
            .on("mouseup", function() {
                self.isDrawingLasso = false;
                const idxs = self.getSamplesInLasso();
                const lasso_filter = new Filter("Lasso", "", idxs);
                self.#dataset.addFilter(lasso_filter);
                self.endLassoTool();
            });
    }

    drawLasso() {
        const self = this;
        this.#svg_canvas.selectAll("path.lasso").remove();
        this.#svg_canvas.selectAll("path.lasso")
            .data([this.lassoPoints])
            .enter()
            .append("path")
            .attr("class", "lasso")
            .attr("d", function (pts) {
                const canvas_corners = [
                    [0,0],
                    [0, self.#height],
                    [self.#width, self.#height],
                    [self.#width, 0],
                ];

                if (pts && pts.length > 0) {
                    const scaled_pts = pts.map(function (pt) {
                        return [
                            pt[0] - self.#margin.left,
                            pt[1] - self.#margin.top
                        ];
                    });
                    return `M${canvas_corners.join("L")}Z
                        M${scaled_pts.join("L")}Z`;
                } else {
                    return `M${canvas_corners.join("L")}Z`;
                }
                
            })
            .style("fill-opacity", 0.2)
            .style("fill", "black")
            .style("stroke", "grey")
            .style("stroke-width", 2)
            .attr("visibility", "visible")
            .style("pointer-events", "none");
    }

    getSamplesInLasso() {
        const self = this;
        const dim_reduction = this.#dim_reduction;
        const idxs = [];

        d3.selectAll(`#${this.containerId} path.datapoint`)
            .each(function(d) {
                const pos = [
                    self.#newX(d[`${dim_reduction}-dim0`]) + self.#margin.left,
                    self.#newY(d[`${dim_reduction}-dim1`]) + self.#margin.top,
                ]
                const isInLasso = self.lassoPoints 
                        && self.lassoPoints.length > 3
                        && d3.polygonContains(self.lassoPoints, pos);
                
                if (isInLasso) {
                    idxs.push(d.idx);
                }
            });
        return idxs;
    }

    endLassoTool() {
        this.#is_lasso_active = false;
        const parent = $(`#${this.#container_id}`).parent();
        parent.css("cursor", "alias")
        this.resumeZoom();
        parent.find(".lasso-interface").remove();
        this.#svg_canvas.selectAll("path.lasso").remove();
        this.lassoPoints = [];
    }

    initializeAxes() {
        const [x, y] = this.getXYScales(this.#dim_reduction, this.#width, this.#height);
        let xAxis = this.#svg_canvas.append("g")
        .attr("transform", "translate(0," + this.#height + ")")
        .call(d3.axisBottom(x).tickValues([]));
        let yAxis = this.#svg_canvas.append("g").call(d3.axisLeft(y).tickValues([]));

        this.#xScale = x;
        this.#yScale = y;
        this.#newX = x;
        this.#newY = y;
        this.#xAxis= xAxis;
        this.#yAxis = yAxis;
    }

    initializeDatapoints() {
        let scatter = this.#svg_canvas.append("g")
        .attr("class", "scatter")
        .attr("clip-path", "url(#clip)");

        const self = this;
        scatter.selectAll("path.datapoint")
            .data(this.#data)
            .enter()
            .append("path")
            .attr("id", d => `node-${d.idx}`)
            .attr("class", "datapoint")
            .attr("d", d3.symbol().type(d3.symbolCircle).size(150))
            .attr("stroke", "#9299a1")
            .attr("transform", function (d) {
                const x_pos = d[`${self.#dim_reduction}-dim0`];
                const y_pos = d[`${self.#dim_reduction}-dim1`];
                const translation = "translate(" + self.#xScale(x_pos) + "," + self.#yScale(y_pos) + ")";
                return translation;
            })
            .on("mouseover", showMapTooltip)
            .on("mousemove", () => moveTooltipToCursor("#map-tooltip"))
            .on("mouseout", () => hideTooltip("#map-tooltip"))
            .on("click", function(d) {
                self.selectNode(d.idx);
                if (self.#parallelMap) 
                    self.#parallelMap.selectNode(d.idx, true);
            });
        
        const isInConfidenceHeatmapMode = $("#show-confidence").prop("checked");
        
        if (isInConfidenceHeatmapMode) {
            this.switchToConfidenceHeatmap();
        } else {
            this.switchToClusterBasedColoring();
        }
    }

    initializeLegend() {
        const parent = $(`#${this.#container_id}`).parent();
        parent.find(".map-legend").remove();

        const models_available = Object.keys(this.#model_dataset_availability).filter(key => 
            this.#model_dataset_availability[key].includes(this.#dataset_name)
        );

        const selected_model = this.modelName;
        const model_options = models_available.reduce(
            (soFar, current) => soFar + 
                        `<option value="${current}" 
                        ${(selected_model == current)? "selected": ""}>${current}</option>`,
            ""
        );

        const labels_selected = this.#selectedLabels || [];
        const label_options = labels_selected.reduce(
            (soFar, current) => soFar + 
            `<option value="${current}"}>${current}</option>`,
            ""
        );
        parent.append(`
            <div class="map-legend">
                <div class="model-select-legend">
                    <b>Model:</b>
                    <select class="model-select-map-specific">
                        ${model_options}
                    </select>
                </div>
                <div class="group-type-legend">
                    <b>Label groups:</b>
                    <br>
                    <select class="label-select-map-specific">
                        <option value="all" selected>All selected</option>
                        ${label_options}
                    </select>
                    <br>
                    <input type="checkbox" class="label-group-type-predicted" name="label-group-type-predicted" checked>
                    <label for="label-group-type-predicted">Predicted</label>
                    <br>
                    <input type="checkbox" class="label-group-type-gold" name="label-group-type-gold">
                    <label for="label-group-type-gold">Ground-truth</label>
                </div>
            </div>
        `);
        const model_select = parent.find(".model-select-map-specific");
        
        const self = this;
        model_select.change(function() {
            const new_model = $(this).val();
            self.changeModel(new_model);

            // if the parallel map has a different model, switch to confidence view
            if (self.modelName != self.parallelMap.modelName) {
                $("#show-confidence").prop("checked", true).change();
            }
        });

        const label_select = parent.find(".label-select-map-specific");
        label_select.change(function() {
            const selected_label = $(this).val();
            self.selectLabels([selected_label], true);
        });

        let updateLabelGroups = function() {
            if (self.#selectedLabels) self.selectLabels(self.#selectedLabels);
        }

        parent.find(".label-group-type-predicted").change(updateLabelGroups);
        parent.find(".label-group-type-gold").change(updateLabelGroups);

        if (this.#is_in_compare_mode) {
            this.showLegend();
        }
    }

    initializeHulls(byGoldLabel) {
        const data = this.#data;
        const cluster_to_color = this.#cluster_to_color;
        const label_to_cluster = this.#label_to_cluster;
        const dim_reduction = this.#dim_reduction;
        const X = this.#xScale;
        const Y = this.#yScale;

        // before drawing the points, draw polygonHulls around each label group
        const labels_to_points_tsne = {};
        const labels_to_points_umap = {};

        data.forEach(function (d) {
            const x_pos_tsne = d[`tsne-dim0`];
            const y_pos_tsne = d[`tsne-dim1`];
            const x_pos_umap = d[`umap-dim0`];
            const y_pos_umap = d[`umap-dim1`];

            const label = (byGoldLabel) ? d.ground_truth : d.prediction;
            // save the locations for later
            if (!labels_to_points_tsne[label]) {
                labels_to_points_tsne[label] = [
                    [x_pos_tsne, y_pos_tsne],
                ];
            } else {
                labels_to_points_tsne[label].push([
                    x_pos_tsne,
                    y_pos_tsne,
                ]);
            }

            if (!labels_to_points_umap[label]) {
                labels_to_points_umap[label] = [
                    [x_pos_umap, y_pos_umap],
                ];
            } else {
                labels_to_points_umap[label].push([
                    x_pos_umap,
                    y_pos_umap,
                ]);
            }
        });

        this.drawHulls(
            dim_reduction == "tsne" ? labels_to_points_tsne : labels_to_points_umap,
            cluster_to_color,
            label_to_cluster,
            X, 
            Y,
            byGoldLabel
        );

        return [labels_to_points_tsne, labels_to_points_umap]
    }

    drawHulls(labels2points, cluster_to_color, 
                        label_to_cluster, X, Y, byGoldLabel) {
        const polyHullsData = {};
        for (const label in labels2points) {
            const pts = labels2points[label];
            if (pts.length < 3) {
                for (let i = 0; i < 3 - pts.length; i++) {
                    pts.push(pts[0]);
                }
            }
            const hull = d3.polygonHull(pts);
            polyHullsData[label] = hull;
        }

        const hullClass = (byGoldLabel) ? "goldLabelHull" : "predictedLabelHull";

        this.#svg_canvas.selectAll("path." + hullClass).remove();
        this.#svg_canvas.selectAll("path." + hullClass)
            .data(Object.entries(polyHullsData))
            .enter()
            .append("path")
            .attr("class", hullClass + " labelHull")
            .attr("d", function (d) {
                const [label, pts] = d;
                const scaled_pts = pts.map(function (pt) {
                    return [X(pt[0]), Y(pt[1])];
                });
                return `M${scaled_pts.join("L")}Z`;
            })
            .style("stroke", "lightblue")
            .style("stroke-width", 3)
            .attr("stroke-dasharray", (byGoldLabel) ? "4": "")
            .style("fill-opacity", (byGoldLabel) ? "0.4" : "0.4")
            .style("fill", function (d) {
                const [label, pts] = d;
                return cluster_to_color[label_to_cluster[label]];
            })
            .attr("visibility", "hidden")
            .style("pointer-events", "none");
    }

    switchToConfidenceHeatmap() {
        const confidence_color = "#89A4C7";

        d3.selectAll(`#${this.containerId} path.datapoint`)
            // .attr("stroke", d => d3.color(d3.interpolateMagma(0.9 * calculateConfidence(d))).darker())
            .attr("fill", (d) => confidence_color)
            .attr("stroke", (d) => d3.color(confidence_color).darker(0.3))
            .attr("fill-opacity", (d) =>
                Math.max(0.2, calculateConfidence(d))
            );
    }

    switchToClusterBasedColoring() {
        const self = this;
        d3.selectAll(`#${this.containerId} path.datapoint`)
            .attr("fill", function (d) {
                let label = parseInt(d["label_cluster"]);
                return self.#cluster_to_color[label];
            })
            .attr("fill-opacity", 1)
            .attr("stroke", "#9299a1");
    }

    addParallelMap(map) {
        if (!this.parallelMap) {
            this.#parallelMap = map;
            map.addParallelMap(this);
        }
    }

    selectLabels(labels, doNotUpdateLabelOptions) {
        this.#selectedLabels = labels;
        const filter = filterByLabelsAndUpdate(this.#data, labels, this.hullClasses);
        this.#dataset.addFilter(filter);
        this.filterHulls(labels);

        if (!doNotUpdateLabelOptions) {
            // Add the labels to the legend
            const parent = $(`#${this.#container_id}`).parent();
            const label_select = parent.find(".label-select-map-specific");

            const labels_selected = this.#selectedLabels || [];
            const label_options = labels_selected.reduce(
                (soFar, current) => soFar + 
                `<option value="${current}"}>${current}</option>`,
                `<option value="all" selected>All selected</option>`
            );

            label_select.html(label_options);
        }
    }

    changeModel(model) {
        this.#model_name = model;
        const self = this;
        d3.json(
            `static/data/${this.#dataset_name.toLowerCase()}-viz_data-${this.#num_clusters}-clusters-label_cluster_chosen_by_majority_in-predicted-label-with-${model.toLowerCase()}.json`,
            function (data) {
                self.#svg_canvas.html(null);

                self.#data = data;
                self.initialize();
        });
    }

    initializeDragLines() {
        this.#svg_canvas.append("line")
        .attr("clip-path", "url(#clip)")
        .attr("class", "drag_line drag-line-0")
        .style("visibility", "hidden")
        .attr("stroke", "lightblue")
        .attr("stroke-width", "3");
        this.#svg_canvas.append("line")
        .attr("clip-path", "url(#clip)")
        .attr("class", "drag_line drag-line-1")
        .style("visibility", "hidden")
        .attr("stroke", "lightblue")
        .attr("stroke-width", "3");
    }

    initializeDragging(dim_reduction, onDragEnd, dataset_name) {
        // Create a dragging behaviour
        let current_dragline;
        let drag = d3
        .drag()
        .on("start", function (d) {
            const [x, y] = getPosition(this);
            const drag_line0 = d3.select("#drag-line-0");
            const drag_line1 = d3.select("#drag-line-1");

            if (
                drag_line0.attr("x1") == x &&
                drag_line0.attr("y1") == y &&
                drag_line0.style("visibility") == "visible"
            ) {
                current_dragline = drag_line1;
            } else {
                drag_line1.style("visibility", "hidden");
                current_dragline = drag_line0;
            }

            current_dragline
                .attr("x1", x)
                .attr("y1", y)
                .attr("x2", x)
                .attr("y2", y)
                .style("visibility", "visible");
        })
        .on("drag", function (d) {
            current_dragline.attr("x2", d3.event.x).attr("y2", d3.event.y);
        })
        .on("end", function (d) {
            const mouseover_dp = d3.select(".ismouseover");
            if (mouseover_dp.empty()) {
                current_dragline.style("visibility", "hidden");
            } else {
                const [x2, y2] = getPosition(mouseover_dp.node());
                const mouseover_dp_data = mouseover_dp.data();
                current_dragline
                    .attr("x2", x2)
                    .attr("y2", y2)
                    .data([
                        {
                            x1: d[`${dim_reduction}-dim0`],
                            y1: d[`${dim_reduction}-dim1`],
                            x2: mouseover_dp_data[0][`${dim_reduction}-dim0`],
                            y2: mouseover_dp_data[0][`${dim_reduction}-dim1`],
                        },
                    ]);

                const idx1 = d.idx;
                const idx2 = mouseover_dp_data[0].idx;
                onDragEnd(idx1, idx2, dataset_name);
            }
        });
        return drag;
    }

    pauseZoom() {
        this.#svg_canvas.select(".zoom-interface")
            .style("pointer-events", "none");
    }

    resumeZoom() {
        this.#svg_canvas.select(".zoom-interface").call(this.zoom)
            .style("pointer-events", "all");
    }

    initializeZoom() {
        // Set the zoom and Pan features: how much you can zoom, on which part, and what to do when there is a zoom
        this.zoom = d3.zoom()
                    .scaleExtent([0.5, 100]) // This control how much you can unzoom (x0.5) and zoom (x20)
                    .extent([
                        [0, 0],
                        [this.#width, this.#height],
                    ])
        .on("zoom", function() {
            this.updateChart();
            this.updateSymbols();
            if (this.isInCompareMode) {
                this.parallelMap.updateChart();
                this.parallelMap.updateSymbols();
            }
        }.bind(this))
        .on("start", function () {
            this.clearLocalWords();
            if (this.isInCompareMode) {
                this.parallelMap.clearLocalWords();
            }
        }.bind(this))
        .on("end", this.#onUpdate);

        // This add an invisible rect on top of the chart area. This rect can recover pointer events: necessary to understand when the user zoom
        this.#svg_canvas.append("rect")
            .attr("class", "zoom-interface")
            .attr("width", this.#width)
            .attr("height", this.#height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .call(this.zoom);    
    }

    clearLocalWords() {
        d3.selectAll(`#${this.containerId} .local_word`).remove();
    }

    update(newDataIdxs, msg, doNotUpdateLocalWords, observerId) {
        if (observerId && observerId != this.#container_id) {
            return;
        }
        if (!newDataIdxs) return;
        this.filterNodes(newDataIdxs);
        this.updateSymbols();
        if (msg == "clear") {
            this.clearHighlightedNode();
            this.hideHulls();
            this.showLegend(false);
        }
        if (!doNotUpdateLocalWords) this.#onUpdate();
    }

    // A function that updates the chart when a user zooms
    updateChart() {
        // recover the new scale
        const newX = d3.event.transform.rescaleX(this.#xScale);
        const newY = d3.event.transform.rescaleY(this.#yScale);
        this.#newX = newX;
        this.#newY = newY;

        // update axes with these new boundaries
        this.#xAxis.call(d3.axisBottom(newX).tickValues([]));
        this.#yAxis.call(d3.axisLeft(newY).tickValues([]));

        this.updatePositions(newX, newY, this.#dim_reduction); 
        this.updateDragLines();

        if (this.#updateCount % 2 == 0) this.#onUpdate(true);
        this.#updateCount++;
    }

    updateDragLines() {
        const newX = this.#newX;
        const newY = this.#newY;

        d3.selectAll(`#${this.#container_id} .drag_line`)
            .filter((d) => Boolean(d))
            .attr("x1", function (d) {
                return newX(d.x1);
            })
            .attr("y1", function (d) {
                return newY(d.y1);
            })
            .attr("x2", function (d) {
                return newX(d.x2);
            })
            .attr("y2", function (d) {
                return newY(d.y2);
            });
    }

    hideDragLines() {
        d3.selectAll(`#${this.#container_id} .drag_line`).style("visibility", "hidden");
    }

    updatePositions(xScale, yScale, dim_reduction) {
        // update positions
        this.#svg_canvas.selectAll(`#${this.containerId} path.datapoint`).attr("transform", function (d) {
            const translation =
                "translate(" +
                xScale(d[`${dim_reduction}-dim0`]) +
                "," +
                yScale(d[`${dim_reduction}-dim1`]) +
                ")";
            return translation;
        });
        // update hulls
        this.#svg_canvas.selectAll(".labelHull").attr("d", function (d) {
            const [label, pts] = d;
            const scaled_hull = pts.map((pt) => [xScale(pt[0]), yScale(pt[1])]);
            return `M${scaled_hull.join("L")}Z`;
        });
    }

    updateSymbols() {
        const [currently_visible_dps, gold_label_set, _] = this.getVisibleDatapoints();

        const self = this;
        if (gold_label_set.length <= symbols.length) {
            const labels_with_symbols = Object.keys(self.#previous_label_symbol_map)
                .map((k) => parseInt(k))
                .filter((k) => gold_label_set.includes(k));
            const labels_without_symbols = gold_label_set.filter(
                (label) => !labels_with_symbols.includes(label)
            );
            const used_symbols = labels_with_symbols.map(
                (k) => self.#previous_label_symbol_map[k]
            );
            const remaining_symbols = symbols.filter(
                (sym) => !used_symbols.includes(sym)
            );
    
            if (labels_without_symbols.length > remaining_symbols.length) {
                throw new Error(
                    "There aren't enough symbols to assign to the newly visible labels: " +
                    `${labels_without_symbols.length} !< ${remaining_symbols.length}`
                );
            }
    
            const label_to_symbol = Object.fromEntries(
                labels_without_symbols.map((label, i) => [
                    label,
                    remaining_symbols[i],
                ])
            );
            currently_visible_dps.attr("d", function (d) {
                const label = d.ground_truth_label_idx;
                if (labels_with_symbols.includes(label)) {
                    return self.#previous_label_symbol_map[label](d);
                } else {
                    return label_to_symbol[label](d);
                }
            });
    
            self.#previous_label_symbol_map = Object.assign(
                self.#previous_label_symbol_map,
                label_to_symbol
            );
        } else {
            currently_visible_dps.attr(
                "d",
                d3.symbol().type(d3.symbolCircle).size(150)
            );
        }
    }

    switchDimReduction(dim_reduction) {
        this.#dim_reduction = dim_reduction;
        const [x, y] = this.getXYScales(dim_reduction);
        this.drawHulls(
            dim_reduction == "tsne"
            ? this.labelsToPointsTSNE
            : this.labelsToPointsUMAP,
            this.#cluster_to_color, 
            this.#label_to_cluster,
            x, y
        );
        this.#xScale = x;
        this.#yScale = y;
        this.#newX = x;
        this.#newY = y;
        this.updatePositions(x, y, dim_reduction);
        this.hideDragLines();
        this.hideHulls();
    }

    getXYScales(dim_reduction) {
        const data = this.#data;

        const xMin = Math.min(...data.map((d) => d[`${dim_reduction}-dim0`]));
        const xMax = Math.max(...data.map((d) => d[`${dim_reduction}-dim0`]));
        const xRange = xMax - xMin;
    
        const yMin = Math.min(...data.map((d) => d[`${dim_reduction}-dim1`]));
        const yMax = Math.max(...data.map((d) => d[`${dim_reduction}-dim1`]));
        const yRange = yMax - yMin;
    
        // Add X axis
        let x = d3
            .scaleLinear()
            .domain([xMin - 0.1 * xRange, xMax + 0.1 * xRange])
            .range([0, this.#width]);
    
        // Add Y axis
        let y = d3
            .scaleLinear()
            .domain([yMin - 0.1 * yRange, yMax + 0.1 * yRange])
            .range([this.#height, 0]);
    
            
        return [x, y];
    }

    filterNodes(idxs) {
        this.#svg_canvas.selectAll(`.datapoint`).style("visibility", function (d) {
            if (idxs.includes(d.idx)) {
                return "visible";
            } else {
                return "hidden";
            }
        }).style("opacity", 1);
    
        d3.selectAll(`#${this.#container_id} .drag_line`).style("visibility", "hidden");
    }

    filterHulls(labels) {
        this.#svg_canvas.selectAll("path.labelHull").attr("visibility", "hidden");
        this.hullClasses.forEach(c => {
            this.#svg_canvas.selectAll("path." + c).attr("visibility", function (d) {
                let [label, _] = d;
                if (labels.includes(label)) {
                    return "visible";
                } else {
                    return "hidden";
                }
            });
        });
        this.showLegend(true);
    }

    showLegend(showGroupTypeCheckboxes) {
        const parent = $(`#${this.#container_id}`).parent();
        parent.find(".map-legend").css("display", "block");

        if (this.isInCompareMode) {
            parent.find(".model-select-legend").css("display", "block");        
        } else {
            parent.find(".model-select-legend").css("display", "none");        
        }

        if (showGroupTypeCheckboxes) {
            parent.find(".group-type-legend").css("display", "block");
        } else {
            parent.find(".group-type-legend").css("display", "none");
        }
    }

    hideLegend() {
        const parent = $(`#${this.#container_id}`).parent();
        parent.find(".map-legend").css("display", "none");
    }

    hideHulls() {
        this.filterHulls([]);
    }

    clearHighlightedNode() {
        $(`#${this.#container_id} .selected-dp`)
            .attr("stroke", "#9299a1")
            .attr("stroke-width", "1px")
            .removeClass("selected-dp");
    }

    getVisibleDatapoints() {
        const width = this.#width;
        const height = this.#height;
        let gold_labels = [];
        let predicted_labels = [];
    
        const visibles = this.#svg_canvas.selectAll(".datapoint").filter(function (d) {
            let x = this.transform.baseVal[0].matrix.e;
            let y = this.transform.baseVal[0].matrix.f;
    
            let is_visible = d3.select(this).style("visibility") == "visible";
            is_visible = is_visible && 0 < x && x < width && 0 < y && y < height;
            if (is_visible) {
                gold_labels.push(d["ground_truth_label_idx"]);
                predicted_labels.push(d["prediction_label_idx"]);
            }
            return is_visible;
        });
    
        let gold_label_set = [...new Set(gold_labels)];
        let predicted_label_set = [...new Set(predicted_labels)];
    
        return [
            visibles,
            Array.from(gold_label_set),
            Array.from(predicted_label_set),
        ];
    }

    selectNode(idx, isSampleToBeNotExplained) {
        const d = this.#svg_canvas.select(`#node-${idx}`).data()[0];
        const [closest_dp, contrast_dp] = this.identifyTwoKeySupportSamples(d);
        
        this.highlightNode(d);
        this.filterNode(d, closest_dp, contrast_dp);

        if (!isSampleToBeNotExplained) { 
            this.explainSample(d, closest_dp, contrast_dp);
        }

        this.drawDragLines(d, closest_dp, contrast_dp);
        this.updateDragLines();
    }

    highlightNode(d) {
        const node = this.#svg_canvas.select(`#node-${d.idx}`).node();
        this.clearHighlightedNode();
        $(node)
            .attr("stroke", "red")
            .attr("stroke-width", "3px")
            .addClass("selected-dp");
    }

    filterNode(d, closest_dp, contrast_dp) {
        let newFilter;

        if (this.isInCompareMode) {
            let idxs;
            let filter_value;
            if (this.containerId == "semantic_landscape-mirror") {
                // show the closest dp only on the right side
                idxs = [closest_dp.idx];
                filter_value = "Closest sample to #" + d.idx;
            } else if (this.containerId == "semantic_landscape") {
                // show the contrast dp only on the left side
                idxs = [contrast_dp.idx];
                filter_value = "Contrast sample to #" + d.idx;
            }
            newFilter = new Filter("Datapoint", filter_value, idxs, true);
        } else {
            newFilter = filterByDatapointAndUpdate(d, this.#data);
        }
        this.#dataset.addFilter(newFilter);
    }

    identifyTwoKeySupportSamples(d) {
        // Identify the closest datapoint
        const similarities_sorted = Array.from(d.distances[0].entries()).sort(
            (a, b) => b[1] - a[1]
        );
        const support_dps = d.support_set.map((idx) => this.#data[idx]);
        const closest_dp = support_dps[similarities_sorted[0][0]]; // closest dp
        
        if (closest_dp.ground_truth_label_idx != d.prediction_label_idx) {
            throw new Error();
        }
        let dp2;
    
        if (d.prediction == d.ground_truth) {
            dp2 = support_dps[similarities_sorted[1][0]]; // second closest dp
        } else {
            dp2 = support_dps.find(
                (dp) => dp.ground_truth_label_idx == d.ground_truth_label_idx
            );
        }
        return [closest_dp, dp2];
    }
    
    explainSample(d, closest_dp, dp2) {
        updateTextSummary(d, closest_dp, dp2);
        emptyImportanceChart();
        emptyRelationChart();
        emptyTokenChart();
    
        if (this.#model_name == "bert") {
            const tok2sim_relations = this.#explanation_set.token2similarity_relations;
            const importances = this.#explanation_set.importances;
            const tok2token_relations =  this.#explanation_set.token2token_relations;
            updateRelationChartFromCache(tok2sim_relations[d.idx].right);
            updateRelationChartFromCache(tok2sim_relations[d.idx].left);
            updateImportanceChartFromCache(importances[d.idx]);
            updateTokenChartFromCache(tok2token_relations[d.idx].right);
            updateTokenChartFromCache(tok2token_relations[d.idx].left);
        } else {
            // Tell the user there is no explanation data for this model
            if (this.#alertCount == 0) {
                alert("Instance-level explanation data for this model is currently unavailable. Only a simple summary will be shown.");
                this.#alertCount++;
            }
        }
    }

    drawDragLines(d, closest_dp, dp2) {
        const filter_by = $('input[name="filter-by"]:checked').val();
        if (filter_by == "support_set") {
            // if the nodes are currently filtered out, show them half transparent
            const selected_node = this.#svg_canvas.select(`#node-${d.idx}`);
            const closest_node = this.#svg_canvas.select(`#node-${closest_dp.idx}`);
            const dp2_node = this.#svg_canvas.select(`#node-${dp2.idx}`);
    
            let closest_node_link_opacity = 1;
            let contrast_node_link_opacity = 1;

            selected_node
                .style("opacity", function() {
                    if (selected_node.style("visibility") == "hidden") {
                        return 0.2;
                    }
                })
                .style("visibility", "visible");
            closest_node
                .style("opacity", function() {
                    if (closest_node.style("visibility") == "hidden") {
                        closest_node_link_opacity = 0.2;
                        return 0.2;
                    }
                })
                .style("visibility", "visible");
            dp2_node
                .style("opacity", function() {
                    if (dp2_node.style("visibility") == "hidden") {
                        contrast_node_link_opacity = 0.2;
                        return 0.2;
                    }
                })
                .style("visibility", "visible");
            
            const dim_reduction = this.#dim_reduction;
            d3.select(`#${this.containerId} .drag-line-0`)
                .attr("x1", (d[`${dim_reduction}-dim0`]))
                .attr("y1", (d[`${dim_reduction}-dim1`]))
                .attr("x2", (closest_dp[`${dim_reduction}-dim0`]))
                .attr("y2", (closest_dp[`${dim_reduction}-dim1`]))
                .style("opacity", closest_node_link_opacity)
                .data([
                    {
                        x1: d[`${dim_reduction}-dim0`],
                        y1: d[`${dim_reduction}-dim1`],
                        x2: closest_dp[`${dim_reduction}-dim0`],
                        y2: closest_dp[`${dim_reduction}-dim1`],
                    },
                ]);
            
            d3.select(`#${this.containerId} .drag-line-1`)
                .attr("x1", (d[`${dim_reduction}-dim0`]))
                .attr("y1", (d[`${dim_reduction}-dim1`]))
                .attr("x2", (dp2[`${dim_reduction}-dim0`]))
                .attr("y2", (dp2[`${dim_reduction}-dim1`]))
                .style("opacity", contrast_node_link_opacity) 
                .data([
                    {
                        x1: d[`${dim_reduction}-dim0`],
                        y1: d[`${dim_reduction}-dim1`],
                        x2: dp2[`${dim_reduction}-dim0`],
                        y2: dp2[`${dim_reduction}-dim1`],
                    },
                ]);

            this.updateDragLines();
            d3.selectAll(`#${this.containerId} .drag_line`)
                .style("visibility", "visible");
        }
    }

    get labelsToPointsTSNE() {
        return this.#labels_to_points_tsne;
    }

    get labelsToPointsUMAP() {
        return this.#labels_to_points_umap;
    }

    get containerId() {
        return this.#container_id;
    }

    get hullClasses() {
        const parent = $(`#${this.#container_id}`).parent();
        const isPredictedGroupChecked= parent.find(".label-group-type-predicted").is(":checked");
        const isGoldGroupChecked = parent.find(".label-group-type-gold").is(":checked");

        const hullClasses = [];
        if (isPredictedGroupChecked) hullClasses.push("predictedLabelHull");
        if (isGoldGroupChecked) hullClasses.push("goldLabelHull");
        return hullClasses;
    }

    get modelName() {
        return this.#model_name;
    }

    get parallelMap() {
        return this.#parallelMap;
    }

    get isInCompareMode() {
        return $("#compare-mode").prop("checked");
    }
}


function getPosition(dp_element) {
    return [
        dp_element.transform.baseVal[0].matrix.e,
        dp_element.transform.baseVal[0].matrix.f,
    ];
}

function filterByLabelsAndUpdate(data, labels, hullClasses) {
    let filter_idxs = [];
    
    if (hullClasses) {
        hullClasses.forEach(c => {
            const byGoldLabel = (c == "goldLabelHull") ? true : false;
            filter_idxs = filter_idxs.concat(
                            filterByLabels(data, labels, byGoldLabel)
                        );
        })
    } else {
        filter_idxs = filter_idxs.concat(
            filterByLabels(data, labels, false)
        );
    }

    const filter_value = (labels.length == 1)? labels[0] : "all selected";
    const filter = new Filter("Label", filter_value, filter_idxs);
    return filter;
}

function filterByDatapointAndUpdate(dp, data) {
    const filter_by = $('input[name="filter-by"]:checked').val();
    const filter_idxs = filterByDatapoint(dp, data, filter_by);
    const filter = new Filter("Datapoint", "#" + dp.idx, filter_idxs);
    return filter;
}

export { MapView }








