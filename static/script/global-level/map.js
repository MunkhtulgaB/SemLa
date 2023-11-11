import { initializeTooltip, 
    hideTooltip, 
    showMapTooltip,
    moveTooltipToCursor } from "./tooltip.js";
import { filterByLabels, 
        calculateConfidence } from "./filters.js";
import { Filter } from "../data.js";


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
    #onClick;
    #explanation_set;
    #is_in_compare_mode;

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
                onClick,
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
        this.#onClick = onClick;
        this.#explanation_set = explanation_set;
        this.#is_in_compare_mode = is_in_compare_mode;

        this.initializeAxes();
        this.initializeZoom();
        this.initializeDatapoints();

        // Initialize dragging behaviour and label hulls
        const [labels_to_points_tsne, 
                labels_to_points_umap] = this.initializeHulls(false); // hulls for predicted groups
        this.initializeHulls(true); // hulls for ground-truth groups

        initializeTooltip("map-tooltip", "container");

        this.#labels_to_points_tsne = labels_to_points_tsne;
        this.#labels_to_points_umap = labels_to_points_umap;
        onUpdate();
        this.initializeLegend();
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
                self.selectNode(this);
                self.#onClick(d, 
                            self.#dataset, 
                            self.#explanation_set, 
                            self);
                self.updateDragLines();
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

    selectLabels(labels) {
        this.#selectedLabels = labels;
        const filter = filterByLabelsAndUpdate(this.#data, labels, this.hullClasses);
        this.#dataset.addFilter(filter);
        this.filterHulls(labels);
    }

    changeModel(model) {
        this.#model_name = model;
        const self = this;
        d3.json(
            `static/data/${this.#dataset_name.toLowerCase()}-viz_data-${this.#num_clusters}-clusters-label_cluster_chosen_by_majority_in-predicted-label-with-${model.toLowerCase()}.json`,
            function (data) {
                self.#svg_canvas.html(null);

                self.#data = data;
                self.initializeAxes();
                self.initializeZoom();
                self.initializeDatapoints();
                self.initializeHulls(false);
                self.initializeHulls(true);
                
                self.#onUpdate();
        });
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


    initializeZoom() {
        // Set the zoom and Pan features: how much you can zoom, on which part, and what to do when there is a zoom
        let zoom = d3.zoom()
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
            d3.selectAll(".scatter").selectAll(".local_word").remove();
        })
        .on("end", this.#onUpdate);

        // This add an invisible rect on top of the chart area. This rect can recover pointer events: necessary to understand when the user zoom
        this.#svg_canvas.append("rect")
            .attr("width", this.#width)
            .attr("height", this.#height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .attr("transform", "translate(" + this.#margin.left + "," + this.#margin.top + ")")
            .call(zoom);    
    }

    update(newDataIdxs, msg, doNotUpdateLocalWords, observerId) {
        if (observerId && observerId != this.#container_id) {
            return;
        }
        if (!newDataIdxs) return;
        this.filterNodes(newDataIdxs);
        this.updateSymbols();
        if (msg == "clear") {
            this.clearSelectedNode();
            this.hideHulls();
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
        d3.selectAll(".drag_line").style("visibility", "hidden");
    }

    updatePositions(xScale, yScale, dim_reduction) {
        // update positions
        d3.selectAll(`#${this.containerId} path.datapoint`).attr("transform", function (d) {
            const translation =
                "translate(" +
                xScale(d[`${dim_reduction}-dim0`]) +
                "," +
                yScale(d[`${dim_reduction}-dim1`]) +
                ")";
            return translation;
        });
        // update hulls
        d3.selectAll(".labelHull").attr("d", function (d) {
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
    
        d3.selectAll(".drag_line").style("visibility", "hidden");
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

    hideHulls() {
        this.filterHulls([]);
    }

    clearSelectedNode() {
        $(".selected-dp")
        .attr("stroke", "#9299a1")
        .attr("stroke-width", "1px")
        .removeClass("selected-dp");
    }

    selectNode(node) {
        this.clearSelectedNode();
        $(node)
            .attr("stroke", "red")
            .attr("stroke-width", "3px")
            .addClass("selected-dp");
    }

    getVisibleDatapoints() {
        const width = this.#width;
        const height = this.#height;
        let gold_labels = [];
        let predicted_labels = [];
    
        const visibles = d3.selectAll(".datapoint").filter(function (d) {
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

    const filter = new Filter("Label", "", filter_idxs);
    return filter;
}

export { MapView }








