import { initializeTooltip, 
    hideTooltip, 
    showMapTooltip,
    moveTooltipToCursor } from "./tooltip.js";
import { initializeHulls, drawHulls } from "./hulls.js";
    

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
    #intents_to_points_tsne;
    #intents_to_points_umap;
    #data;
    #width;
    #height;
    #cluster_to_color;
    #intent_to_cluster;
    #xScale;
    #yScale;
    #xAxis;
    #yAxis;
    #dim_reduction;
    #newX;
    #newY;
    #onUpdate;
    #updateCount = 0;
    #previous_intent_symbol_map = {};

    constructor(svg_canvas, 
                margin,
                width, 
                height, 
                dataset, 
                explanation_set,
                cluster_to_color, 
                intent_to_cluster,
                dim_reduction,
                onUpdate,
                onClick,
                onDragEnd,
                dataset_name) {
        const data = dataset.data;
        dataset.addObserver(this);
        
        this.#data = data;
        this.#width = width;
        this.#height = height;
        this.#cluster_to_color = cluster_to_color;
        this.#intent_to_cluster = intent_to_cluster;
        this.#dim_reduction = dim_reduction;
        this.#onUpdate = onUpdate; 
        
        // Initialize axes
        const [x, y] = this.getXYScales(dim_reduction, width, height);
        let xAxis = svg_canvas.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));
        let yAxis = svg_canvas.append("g").call(d3.axisLeft(y));

        this.#xScale = x;
        this.#yScale = y;
        this.#newX = x;
        this.#newY = y;
        this.#xAxis= xAxis;
        this.#yAxis = yAxis;

        // Initialize zoom
        this.initializeZoom(svg_canvas, 
            margin, 
            width, 
            height, 
            x, 
            y, 
            xAxis, 
            yAxis, 
            dim_reduction,
            onUpdate);

        // Create the scatter plot
        let scatter = svg_canvas.append("g")
        .attr("id", "scatter")
        .attr("clip-path", "url(#clip)");

        // Initialize dragging behaviour and intent hulls
        const [intents_to_points_tsne, 
                intents_to_points_umap] = initializeHulls(data, 
                                                    cluster_to_color, 
                                                    intent_to_cluster, 
                                                    dim_reduction, 
                                                    x, 
                                                    y);

        // Draw the points
        const self = this;
        scatter.selectAll("path.datapoint")
            .data(data)
            .enter()
            .append("path")
            .attr("id", d => `node-${d.idx}`)
            .attr("class", "datapoint")
            .attr("d", d3.symbol().type(d3.symbolCircle).size(150))
            .attr("stroke", "#9299a1")
            .attr("fill", function (d) {
                const label_cluster = (d.label_cluster != undefined)? d.label_cluster : d.intent_cluster;
                let label = parseInt(label_cluster);
                return cluster_to_color[label];
            })
            .attr("transform", function (d) {
                const x_pos = d[`${dim_reduction}-dim0`];
                const y_pos = d[`${dim_reduction}-dim1`];
                const translation = "translate(" + x(x_pos) + "," + y(y_pos) + ")";
                return translation;
            })
            .on("mouseover", showMapTooltip)
            .on("mousemove", () => moveTooltipToCursor("#map-tooltip"))
            .on("mouseout", () => hideTooltip("#map-tooltip"))
            .on("click", function(d) {
                self.selectNode(this);
                onClick(d, dataset, explanation_set);
                self.updateDragLines();
            });

        initializeTooltip("map-tooltip", "container");

        this.#intents_to_points_tsne = intents_to_points_tsne;
        this.#intents_to_points_umap = intents_to_points_umap;
        onUpdate();
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


    initializeZoom(svg_canvas, 
                    margin, 
                    width, 
                    height) {
        // Set the zoom and Pan features: how much you can zoom, on which part, and what to do when there is a zoom
        let zoom = d3.zoom()
                    .scaleExtent([0.5, 100]) // This control how much you can unzoom (x0.5) and zoom (x20)
                    .extent([
                        [0, 0],
                        [width, height],
                    ])
        .on("zoom", function() {
            this.updateChart();
            this.updateSymbols();
        }.bind(this))
        .on("start", function () {
            d3.select("#scatter").selectAll(".local_word").remove();
        })
        .on("end", this.#onUpdate);

        // This add an invisible rect on top of the chart area. This rect can recover pointer events: necessary to understand when the user zoom
        svg_canvas.append("rect")
            .attr("width", width)
            .attr("height", height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
            .call(zoom);    
    }

    update(newData, msg) {
        this.filterNodes(newData.map(d => d.idx));
        this.updateSymbols();
        if (msg == "clear") {
            this.clearSelectedNode();
            this.hideHulls();
        }
        this.#onUpdate();
    }

    // A function that updates the chart when a user zooms
    updateChart() {
        // recover the new scale
        const newX = d3.event.transform.rescaleX(this.#xScale);
        const newY = d3.event.transform.rescaleY(this.#yScale);
        this.#newX = newX;
        this.#newY = newY;

        // update axes with these new boundaries
        this.#xAxis.call(d3.axisBottom(newX));
        this.#yAxis.call(d3.axisLeft(newY));

        this.updatePositions(newX, newY, this.#dim_reduction); 
        this.updateDragLines();

        if (this.#updateCount % 2 == 0) this.#onUpdate(true);
        this.#updateCount++;
    }

    updateDragLines() {
        const newX = this.#newX;
        const newY = this.#newY;

        d3.selectAll(".drag_line")
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
        d3.selectAll("path.datapoint").attr("transform", function (d) {
            const translation =
                "translate(" +
                xScale(d[`${dim_reduction}-dim0`]) +
                "," +
                yScale(d[`${dim_reduction}-dim1`]) +
                ")";
            return translation;
        });
        // update hulls
        d3.selectAll("path.intentHull").attr("d", function (d) {
            const [intent, pts] = d;
            const scaled_hull = pts.map((pt) => [xScale(pt[0]), yScale(pt[1])]);
            return `M${scaled_hull.join("L")}Z`;
        });
    }

    updateSymbols() {
        const [currently_visible_dps, gold_intent_set, _] = this.getVisibleDatapoints();

        const self = this;
        if (gold_intent_set.length <= symbols.length) {
            const intents_with_symbols = Object.keys(self.#previous_intent_symbol_map)
                .map((k) => parseInt(k))
                .filter((k) => gold_intent_set.includes(k));
            const intents_without_symbols = gold_intent_set.filter(
                (intent) => !intents_with_symbols.includes(intent)
            );
            const used_symbols = intents_with_symbols.map(
                (k) => self.#previous_intent_symbol_map[k]
            );
            const remaining_symbols = symbols.filter(
                (sym) => !used_symbols.includes(sym)
            );
    
            if (intents_without_symbols.length > remaining_symbols.length) {
                throw new Error(
                    "There aren't enough symbols to assign to the newly visible intents: " +
                    `${intents_without_symbols.length} !< ${remaining_symbols.length}`
                );
            }
    
            const intent_to_symbol = Object.fromEntries(
                intents_without_symbols.map((intent, i) => [
                    intent,
                    remaining_symbols[i],
                ])
            );
            currently_visible_dps.attr("d", function (d) {
                const intent = d.ground_truth_label_idx;
                if (intents_with_symbols.includes(intent)) {
                    return self.#previous_intent_symbol_map[intent](d);
                } else {
                    return intent_to_symbol[intent](d);
                }
            });
    
            self.#previous_intent_symbol_map = Object.assign(
                self.#previous_intent_symbol_map,
                intent_to_symbol
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
        drawHulls(
            dim_reduction == "tsne"
            ? this.intentsToPointsTSNE
            : this.intentsToPointsUMAP,
            this.#cluster_to_color, 
            this.#intent_to_cluster,
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
        d3.selectAll(".datapoint").style("visibility", function (d) {
            if (idxs.includes(d.idx)) {
                return "visible";
            } else {
                return "hidden";
            }
        }).style("opacity", 1);
    
        d3.selectAll(".drag_line").style("visibility", "hidden");
    }

    filterHulls(intents) {
        d3.selectAll("path.intentHull").attr("visibility", function (d) {
            let [intent, _] = d;
            if (intents.includes(intent)) {
                return "visible";
            } else {
                return "hidden";
            }
        });
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
        let gold_intents = [];
        let predicted_intents = [];
    
        const visibles = d3.selectAll(".datapoint").filter(function (d) {
            let x = this.transform.baseVal[0].matrix.e;
            let y = this.transform.baseVal[0].matrix.f;
    
            let is_visible = d3.select(this).style("visibility") == "visible";
            is_visible = is_visible && 0 < x && x < width && 0 < y && y < height;
            if (is_visible) {
                gold_intents.push(d["ground_truth_label_idx"]);
                predicted_intents.push(d["prediction_label_idx"]);
            }
            return is_visible;
        });
    
        let gold_intent_set = [...new Set(gold_intents)];
        let predicted_intent_set = [...new Set(predicted_intents)];
    
        return [
            visibles,
            Array.from(gold_intent_set),
            Array.from(predicted_intent_set),
        ];
    }
    

    get intentsToPointsTSNE() {
        return this.#intents_to_points_tsne;
    }

    get intentsToPointsUMAP() {
        return this.#intents_to_points_umap;
    }
}


function getPosition(dp_element) {
    return [
        dp_element.transform.baseVal[0].matrix.e,
        dp_element.transform.baseVal[0].matrix.f,
    ];
}


export { MapView }








