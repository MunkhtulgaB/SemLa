import { getStopwords } from "./stopwords.js";
import { updateRelationChart, 
        updateImportanceChart,
        updateTokenChart,
        loadingImportanceChart, 
        emptyRelationChart, 
        emptyTokenChart } from "./instance-level.js";
import { populateConfusionTable,
        populateIntentTable } from "./intent-level.js";
import { initializeTooltip, 
        hideTooltip, 
        showTooltip,
        moveTooltipToCursor } from "./global-level/tooltip.js";
import { initializeHulls, drawHulls } from "./global-level/hulls.js";
import { clear, 
         filterByIntents, 
         filterByConfidence,
         filterByDatapoint, 
         filterChart, 
         filterHulls,
         getVisibleDatapoints, 
         calculateConfidence } from "./global-level/filters.js";


let filterByIdxAndUpdate = function(idxs) { 
    filterChart(idxs);
    updateSymbols();
    updateLocalWords();
}

let filterByDatapointAndUpdate = function(dp, data) {
    const filter_by = $('input[name="filter-by"]:checked').val();
    filterByDatapoint(dp, data, filter_by);
    updateSymbols();
    updateLocalWords();
}

let filterByIntentsAndUpdate = function(data, intents, bbox) {
    filterByIntents(data, intents, bbox);
    updateSymbols();
    updateLocalWords();
}

let filterByConfidenceAndUpdate = function(data) {
    filterByConfidence(data);
    updateSymbols();
    updateLocalWords();
}

let clearAndUpdate = function(data) {
    clear(data);
    updateSymbols();
    updateLocalWords();
}












const STOP_WORDS = getStopwords();


// make widgets collapsible
$(".widget_title").click(function () {
    $(this).parent().find(".widget_content").slideToggle();
});

// set the dimensions and margins of the graph
let margin = { top: 10, right: 30, bottom: 30, left: 60 },
    width = 1000 - margin.left - margin.right,
    height = 900 - margin.top - margin.bottom;

// append the SVG object to the body of the page
let SVG = d3
    .select("svg#semantic_landscape")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .select("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Add a clipPath: everything out of this area won't be drawn.
let clip = SVG.append("defs")
    .append("SVG:clipPath")
    .attr("id", "clip")
    .append("SVG:rect")
    .attr("width", width)
    .attr("height", height)
    .attr("x", 0)
    .attr("y", 0);

SVG.append("line")
    .attr("clip-path", "url(#clip)")
    .attr("id", "drag-line-0")
    .attr("class", "drag_line")
    .style("visibility", "hidden")
    .attr("stroke", "lightblue")
    .attr("stroke-width", "3");
SVG.append("line")
    .attr("clip-path", "url(#clip)")
    .attr("id", "drag-line-1")
    .attr("class", "drag_line")
    .style("visibility", "hidden")
    .attr("stroke", "lightblue")
    .attr("stroke-width", "3");

let dim_reduction = "tsne";




















































// GLOBAL CONSTANTS


let newX;
let newY;



let global_data;
let previous_intent_symbol_map = {};


let forceSimulation;
// Initialise a variable for keeping track of currently visible datapoints
let currently_visible_dps = d3.selectAll(".datapoint");



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










































// Map initialization
















function onclick(d, data) {
    filterByDatapointAndUpdate(d, data);

    $(".selected-dp")
        .removeClass("selected-dp")
        .attr("stroke", "#9299a1")
        .attr("stroke-width", "1px");
    $(this)
        .attr("stroke", "red")
        .attr("stroke-width", "3px")
        .addClass("selected-dp");
    
    // Update importance and relations charts
    const similarities_sorted = Array.from(d.distances[0].entries()).sort(
        (a, b) => b[1] - a[1]
    );
    const support_dps = d.support_set.map((idx) => global_data[idx]);
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

    // Give summary of selected point
    const is_prediction_correct = d.prediction == d.ground_truth;
    const html = `<div>
            <p><b>Text: </b> ${d.text}<p>
            <p><b>Predicted</b> intent was <b>${d.prediction}</b> ${is_prediction_correct
            ? `(<span style="color: green">correct</span>)`
            : `(<span style="color: red">wrong</span>)`
        }
                based on closest support example.
            </p>
            ${!is_prediction_correct
            ? `<p><b>Ground-truth</b> intent is <b>${d.ground_truth}</b>.</p>`
            : ""
        }
            </div>

            <hr>
            <div>
            <div><b>Closest support example: </b></div>
            ${closest_dp.text}
            (${closest_dp.ground_truth})
            </div>

            <hr>
            <div>
            <div><b>${is_prediction_correct
            ? "Next closest example:"
            : "Correct support example:"
        }</b></div>
            ${dp2.text}
            (${dp2.ground_truth})
            </div>
            
            `;

    d3.select("#summary").html(html);

    // populate the relchart automatically
    loadingImportanceChart();
    emptyRelationChart();
    emptyTokenChart();

    updateRelationChart(d.idx, closest_dp.idx, DATASET_NAME)
        .then((_) => updateRelationChart(d.idx, dp2.idx, DATASET_NAME))
        .then((_) => updateImportanceChart(d, DATASET_NAME))
        .then((_) => updateTokenChart(d.idx, closest_dp.idx, DATASET_NAME))
        .then((_) => updateTokenChart(d.idx, dp2.idx, DATASET_NAME));

    // draw the draglines to the two support examples
    const filter_by = $('input[name="filter-by"]:checked').val();
    if (filter_by == "support_set") {
        d3.select("#drag-line-0")
            .attr("x1", newX(d[`${dim_reduction}-dim0`]))
            .attr("y1", newY(d[`${dim_reduction}-dim1`]))
            .attr("x2", newX(closest_dp[`${dim_reduction}-dim0`]))
            .attr("y2", newY(closest_dp[`${dim_reduction}-dim1`]))
            .data([
                {
                    x1: d[`${dim_reduction}-dim0`],
                    y1: d[`${dim_reduction}-dim1`],
                    x2: closest_dp[`${dim_reduction}-dim0`],
                    y2: closest_dp[`${dim_reduction}-dim1`],
                },
            ])
            .style("visibility", "visible");

        d3.select("#drag-line-1")
            .attr("x1", newX(d[`${dim_reduction}-dim0`]))
            .attr("y1", newY(d[`${dim_reduction}-dim1`]))
            .attr("x2", newX(dp2[`${dim_reduction}-dim0`]))
            .attr("y2", newY(dp2[`${dim_reduction}-dim1`]))
            .data([
                {
                    x1: d[`${dim_reduction}-dim0`],
                    y1: d[`${dim_reduction}-dim1`],
                    x2: dp2[`${dim_reduction}-dim0`],
                    y2: dp2[`${dim_reduction}-dim1`],
                },
            ])
            .style("visibility", "visible");
    }
}


// A function that updates the chart when the user zoom and thus new boundaries are available
function updateChart(x, y, xAxis, yAxis) {
    // recover the new scale
    newX = d3.event.transform.rescaleX(x);
    newY = d3.event.transform.rescaleY(y);

    // update axes with these new boundaries
    xAxis.call(d3.axisBottom(newX));
    yAxis.call(d3.axisLeft(newY));

    updatePositions(newX, newY);

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
    updateLocalWords(true);
}



























function initializeDragging() {
     // Create a dragging behaviour
     let current_dragline;
     let drag = d3
     .drag()
     .on("start", function (d) {
         const [x, y] = get_position(this);
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
             const [x2, y2] = get_position(mouseover_dp.node());
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
             updateRelationChart(idx1, idx2, DATASET_NAME);
         }
    });
    return drag;
}


function initializeZoom(x, y, xAxis, yAxis) {
    // Set the zoom and Pan features: how much you can zoom, on which part, and what to do when there is a zoom
    let zoom = d3
    .zoom()
    .scaleExtent([0.8, 100]) // This control how much you can unzoom (x0.5) and zoom (x20)
    .extent([
        [0, 0],
        [width, height],
    ])
    .on("zoom", () => updateChart(x, y, xAxis, yAxis))
    .on("start", function () {
        d3.select("#scatter").selectAll(".local_word").remove();
    })
    .on("end", function () {
        updateSymbols();
        updateLocalWords();
    });
    
    // This add an invisible rect on top of the chart area. This rect can recover pointer events: necessary to understand when the user zoom
    SVG.append("rect")
    .attr("width", width)
    .attr("height", height)
    .style("fill", "none")
    .style("pointer-events", "all")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
    .call(zoom);    
}


function initializeMap(data, cluster_to_color, intent_to_cluster) {
    let xMin = Math.min(...data.map((d) => d["tsne-dim0"]));
    let xMax = Math.max(...data.map((d) => d["tsne-dim0"]));
    let xRange = xMax - xMin;

    let yMin = Math.min(...data.map((d) => d["tsne-dim1"]));
    let yMax = Math.max(...data.map((d) => d["tsne-dim1"]));
    let yRange = yMax - yMin;

    // Add X axis
    let x = d3.scaleLinear()
    .domain([xMin - 0.1 * xRange, xMax + 0.1 * xRange])
    .range([0, width]);

    // Add Y axis
    let y = d3.scaleLinear()
    .domain([yMin - 0.1 * yRange, yMax + 0.1 * yRange])
    .range([height, 0]);
    let xAxis = SVG.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x));
    let yAxis = SVG.append("g").call(d3.axisLeft(y));

    newX = x;
    newY = y;

    initializeZoom(x, y, xAxis, yAxis);

    // Create the scatter variable
    let scatter = SVG.append("g")
                    .attr("id", "scatter")
                    .attr("clip-path", "url(#clip)");

    const drag = initializeDragging();
    const [intents_to_points_tsne, intents_to_points_umap] = initializeHulls(data, cluster_to_color, intent_to_cluster, 
                    dim_reduction, newX, newY);

    // draw the points
    scatter
    .selectAll("path.datapoint")
    .data(data)
    .enter()
    .append("path")
    .attr("class", "datapoint")
    .attr("d", d3.symbol().type(d3.symbolCircle).size(150))
    .attr("stroke", "#9299a1")
    .attr("fill", function (d) {
        let label = parseInt(d["intent_cluster"]);
        return cluster_to_color[label];
    })
    .attr("transform", function (d) {
        const x_pos = d[`${dim_reduction}-dim0`];
        const y_pos = d[`${dim_reduction}-dim1`];
        const translation = "translate(" + x(x_pos) + "," + y(y_pos) + ")";
        return translation;
    })
    .on("mouseover", showTooltip)
    .on("mousemove", moveTooltipToCursor)
    .on("mouseout", hideTooltip)
    .on("click", function(d) {
        onclick.bind(this)(d, data);
    })
    .call(drag);

    initializeTooltip();
    return [intents_to_points_tsne, intents_to_points_umap]
}

















































// Load data
const DATASETS = ["banking", "hwu", "clinc"];
const DATASET_NAME = "banking";
const NUM_CLUSTERS = 12;

$("#dataset_name").html(`<b>${DATASET_NAME.toUpperCase()}</b>`);

d3.json(
    `static/data/${DATASET_NAME.toLowerCase()}-viz_data-${NUM_CLUSTERS}-clusters-intent_cluster_chosen_by_majority_in-predicted-intent.json`,
    function (data) {
        global_data = data;

        // Parse data structure
        const cluster_to_color = d3.schemeSet3;
        const cluster_to_intent = {};
        const intent_to_cluster = {};

        data.forEach(function (d) {
            if (!cluster_to_intent[d.intent_cluster]) {
                cluster_to_intent[d.intent_cluster] = new Set([d.ground_truth]);
            } else {
                cluster_to_intent[d.intent_cluster].add(d.ground_truth);
            }

            if (!intent_to_cluster[d.prediction_label_idx]) {
                intent_to_cluster[d.prediction_label_idx] = d.intent_cluster;
            }
        });

        // Identify errors
        const errors = [];
        const confusions = {};
        const gt_counts = {};
        const pred_counts = {};
        const errors_idxs = [];
        const corrects = [];
        data.forEach((dp, idx) => {
            if (dp["ground_truth_label_idx"] != dp["prediction_label_idx"]) {
                errors.push(dp);
                errors_idxs.push(idx);

                const confusion_key = dp.ground_truth + "," + dp.prediction;

                if (confusion_key in confusions) {
                    confusions[confusion_key].push(dp.text);
                } else {
                    confusions[confusion_key] = [dp.text];
                }

                if (dp.ground_truth in gt_counts) {
                    gt_counts[dp.ground_truth] += 1;
                } else {
                    gt_counts[dp.ground_truth] = 0;
                }

                if (dp.prediction in pred_counts) {
                    pred_counts[dp.prediction] += 1;
                } else {
                    pred_counts[dp.prediction] = 0;
                }
            } else if (dp["ground_truth_label_idx"] == dp["prediction_label_idx"]) {
                corrects.push(dp);
            }
        });

        let filterBySelectedIntents = function() {
            const intents = $(this).val();
            const bbox = {"width": width, "height": height};
            filterByIntentsAndUpdate(data, intents, bbox);
        }

        let filterBySelectedConfusion = function() {
            const gt = d3.select(this).attr("gt");
            const pred = d3.select(this).attr("pred");
            const bbox = {"width": width, "height": height};
            filterByIntentsAndUpdate(data, [gt, pred], bbox);

            $(".selected-tr").removeClass("selected-tr");
            $(this).addClass("selected-tr");
        }

        const [intents_to_points_tsne, intents_to_points_umap] = 
                initializeMap(data, cluster_to_color, intent_to_cluster);
        populateIntentTable(cluster_to_intent, 
                            cluster_to_color, 
                            filterBySelectedIntents);
        populateConfusionTable(confusions, 
                                gt_counts, 
                                pred_counts,
                                filterBySelectedConfusion);

        const accuracy = 100 - (errors.length / data.length) * 100;
        $("#accuracy").html(`<b>${accuracy.toFixed(1)}</b>`);


        $(document)
            .ready(function () {
                const dim_reduction_option = $('input[name="dim-reduction"]');
                const groupby_option = $('input[name="group-by"]');
                const filterby_option = $('input[name="filter-by"]');
                const is_to_show_errors_only = $("#show-errors");
                const filter_input = $("#filter");
                const clear_btn = $("#clear-filter");
            
                // Toggle local words
                $("#show-local-words").change(function () {
                    // fade the datapoints
                    d3.selectAll("path.datapoint").style("stroke-opacity", function (d) {
                        const current_opacity = d3.select(this).style("stroke-opacity");

                        if (current_opacity == 1) {
                            return 0.6;
                        } else {
                            return 1;
                        }
                    });

                    // show the local words
                    updateLocalWords();
                });
                $("#how-many-grams").change(updateLocalWords);
                $("#ignore-stopwords").change(updateLocalWords);

                // Locality shape
                $('input[name="locality-shape"]').change(updateLocalWords);

                // Local area size threshold
                $("#localAreaThreshold")
                    .on("mousedown", function () {
                        const locality_shape = $(
                            'input[name="locality-shape"]:checked'
                        ).val();
                        d3.select("#scatter")
                            .append("rect")
                            .attr("id", "localitySizer")
                            .attr("visibility", "hidden")
                            .attr("stroke", "red")
                            .attr("stroke-width", 1)
                            .attr("fill", "rgba(255, 0, 0, 0.2)")
                            .attr("x", width / 2)
                            .attr("y", height / 2);
                    })
                    .on("mouseup", function () {
                        d3.select("#localitySizer").remove();
                    })
                    .on("change", updateLocalWords)
                    .on("input", function () {
                        const localitySize = $(this).val();
                        d3.select("#localitySizer")
                            .attr("visibility", "visible")
                            .attr("width", localitySize)
                            .attr("height", localitySize)
                            .attr("r", localitySize)
                            .attr("x", width / 2 - localitySize / 2)
                            .attr("y", height / 2 - localitySize / 2);
                        updateLocalWords();
                    });

                // Frequency threshold
                $("input.freqThreshold").change(updateLocalWords);

                // Dimension reduction method
                dim_reduction_option.change(function () {
                    const dim_reduction_attr = $(
                        'input[name="dim-reduction"]:checked'
                    ).val(); // TO REFACTOR: use const and let instead of let or vice versa consistently
                    dim_reduction = dim_reduction_attr;
                    const [x, y] = getXYScales(data);
                    drawHulls(
                        dim_reduction == "tsne"
                            ? intents_to_points_tsne
                            : intents_to_points_umap,
                        cluster_to_color, 
                        intent_to_cluster,
                        newX, newY
                    );
                    updatePositions(x, y);
                    updateLocalWords();
                    filterHulls([]);
                });

                // Group-by (colour-by) option
                groupby_option.change(function () {
                    const groupby_attr = $('input[name="group-by"]:checked').val(); // TO REFACTOR: use const and let instead of let or vice versa consistently
                    d3.selectAll(".datapoint").style("fill", function (d) {
                        const idx = parseInt(d[groupby_attr]);
                        return cluster_to_color[idx];
                    });
                });

                // Filter-by (filter-by) option
                filterby_option.change(function () {
                    const d = d3.select("#scatter").select(".selected-dp").data();
                    filterByDatapointAndUpdate(d[0], data);
                });

                // Show errors only?
                let idxs_before_error_filter = null;
                is_to_show_errors_only.on("change", function() {
                    idxs_before_error_filter = showCurrentErrors(idxs_before_error_filter)
                });

                // Show confidence?
                $("#show-confidence").on("change", function () {
                    if ($("#show-confidence").is(":checked")) {
                        // color in the same way and differentiate by opacity
                        const confidence_color = "#89A4C7";

                        d3.selectAll("path.datapoint")
                            // .attr("stroke", d => d3.color(d3.interpolateMagma(0.9 * calculateConfidence(d))).darker())
                            .attr("fill", (d) => confidence_color)
                            .attr("stroke", (d) => d3.color(confidence_color).darker(0.3))
                            .attr("fill-opacity", (d) =>
                                Math.max(0.2, calculateConfidence(d))
                            );
                    } else {
                        // switch back to normal coloring
                        d3.selectAll("path.datapoint")
                            .attr("fill", function (d) {
                                let label = parseInt(d["intent_cluster"]);
                                return cluster_to_color[label];
                            })
                            .attr("fill-opacity", 1)
                            .attr("stroke", "#9299a1");
                    }
                });

                // Add a confidence range filter
                $("input.confThreshold").change(() => 
                                    filterByConfidenceAndUpdate(data));

                // Show local words?
                is_to_show_errors_only.change(updateLocalWords);

                // Filter input
                filter_input.on("input", function (e) {
                    let [visibles, gold_intent_set, predicted_intent_set] =
                        getVisibleDatapoints(width, height); // TO REFACTOR: reduce the call to getVisibleDatapoints(width, height) when updateSymbols is called in the same context

                    const filter_value = e.target.value;
                    const filter_phrases = filter_value.split(",");

                    const filter_idxs = visibles
                        .filter(function (d) {
                            return filter_phrases.every(function (phrase) {
                                return d.text.includes(phrase);
                            });
                        })
                        .data()
                        .map((d) => d.idx);
                    if (filter_idxs.length == 0) {
                        filterByIdxAndUpdate([-1]);
                    } else {
                        filterByIdxAndUpdate(filter_idxs);
                    }
                });

                // Clear button
                clear_btn.on("click", function (e) {
                    clearAndUpdate(data);
                });
            })
            .keyup(function (e) {
                if (e.key === "Escape") {
                    // escape key maps to keycode `27`
                    clearAndUpdate(data);
                }
            });

        updateLocalWords();

        function showCurrentErrors(idxs_before_error_filter) {
            if ($("#show-errors").is(":checked")) {
                let [visibles, gold_intent_set, predicted_intent_set] =
                    getVisibleDatapoints(width, height); // TO REFACTOR: reduce the call to getVisibleDatapoints(width, height) when updateSymbols is called in the same context

                idxs_before_error_filter = visibles.data().map((d) => d.idx);
                const idxs = visibles
                    .filter((d) => errors_idxs.includes(d.idx))
                    .data()
                    .map((d) => d.idx);
                filterByIdxAndUpdate(idxs);
            } else {
                filterByIdxAndUpdate(idxs_before_error_filter || []);
            }
            return idxs_before_error_filter
        }

    }
);



function getXYScales(data) {
    // TO REFACTOR: use this instead of repetition
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
        .range([0, width]);

    // Add Y axis
    let y = d3
        .scaleLinear()
        .domain([yMin - 0.1 * yRange, yMax + 0.1 * yRange])
        .range([height, 0]);

    return [x, y];
}









































// Symbols















function updateSymbols() {
    let [visibles, gold_intent_set, predicted_intent_set] =
        getVisibleDatapoints(width, height);

    currently_visible_dps = visibles;

    if (gold_intent_set.length <= symbols.length) {
        const intents_with_symbols = Object.keys(previous_intent_symbol_map)
            .map((k) => parseInt(k))
            .filter((k) => gold_intent_set.includes(k));
        const intents_without_symbols = gold_intent_set.filter(
            (intent) => !intents_with_symbols.includes(intent)
        );
        const used_symbols = intents_with_symbols.map(
            (k) => previous_intent_symbol_map[k]
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
                return previous_intent_symbol_map[intent](d);
            } else {
                return intent_to_symbol[intent](d);
            }
        });

        previous_intent_symbol_map = Object.assign(
            previous_intent_symbol_map,
            intent_to_symbol
        );
    } else {
        currently_visible_dps.attr(
            "d",
            d3.symbol().type(d3.symbolCircle).size(150)
        );
    }
}



































// Positions




















function updatePositions(xScale, yScale) {
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




/*
Return the position of the given circle/triangle
*/
function get_position(dp_element) {
    return [
        dp_element.transform.baseVal[0].matrix.e,
        dp_element.transform.baseVal[0].matrix.f,
    ];
}
































// LOCAL WORDS








// A function that counts word frequency in all visible dps
function updateLocalWords(disableForce) {
    if (forceSimulation) {
        forceSimulation.stop();
    }

    const is_to_show_local_words = $("#show-local-words").is(":checked");
    const is_to_ignore_stopwords = $("#ignore-stopwords").is(":checked");
    const n_grams = $("#how-many-grams").val();
    const locality_threshold = $("#localAreaThreshold").val();
    const freq_threshold_lower = parseInt(
        $("input.freqThreshold[data-index=0]").val()
    );
    const freq_threshold_upper = parseInt(
        $("input.freqThreshold[data-index=1]").val()
    );

    if (!is_to_show_local_words || !n_grams || n_grams < 1) {
        d3.selectAll(".local_word").remove();
        return;
    }

    let [visibles, gold_intent_set, predicted_intent_set] =
        getVisibleDatapoints(width, height); // TO REFACTOR: reduce the call to getVisibleDatapoints(width, height) when updateSymbols is called in the same context
    let word_positions = {};

    visibles.each(function (d) {
        const pos_x = this.transform.baseVal[0].matrix.e;
        const pos_y = this.transform.baseVal[0].matrix.f;
        const txt = d.text;
        const regex = `\\b(\\w+${"\\s\\w+[.!?\\-']?\\w*".repeat(
            n_grams - 1
        )})\\b`;
        const words = txt.match(new RegExp(regex, "g"));
        if (words) {
            words.forEach(function (word) {
                if (
                    is_to_ignore_stopwords &&
                    STOP_WORDS.includes(word.toLowerCase())
                )
                    return;

                if (word in word_positions) {
                    word_positions[word].push([pos_x, pos_y]);
                } else {
                    word_positions[word] = [[pos_x, pos_y]];
                }
            });
        }
    });

    word_positions = Object.entries(word_positions);

    const locality_shape = $('input[name="locality-shape"]:checked').val();
    let locality_fn = null;
    if (locality_shape == "square") {
        locality_fn = filterLocalWordsWithSquareLocality;
    } else if (locality_shape == "gaussian") {
        locality_fn = filterLocalWordsWithGaussianLocality;
    }

    // if a word is localised, then we display that word there
    const localised_words = locality_fn(
        word_positions,
        freq_threshold_lower,
        freq_threshold_upper,
        locality_threshold
    );

    d3.selectAll(".local_word").remove();
    d3.select("#scatter")
        .selectAll("text")
        .data(localised_words)
        .enter()
        .append("text")
        .attr("class", "local_word")
        .text((d) => d.word)
        .style("font-size", (d) => fontSize(d) + "px")
        .attr("x", function (d) {
            return d.x;
        })
        .attr("y", function (d) {
            return d.y;
        })
        .style("fill", "#001617")
        .style("font-weight", "bold")
        .style("stroke", "white")
        .style("stroke-width", 0.4);

    if (disableForce != true) {
        // Apply force to prevent collision between texts
        forceSimulation = d3
            .forceSimulation(localised_words)
            // .force("x", d3.forceX().x(d => d.x).strength(d => d.frequency/100))
            // .force("y", d3.forceY().y(d => d.y).strength(d => d.frequency/100))
            .force("collision", forceCollide())
            .on("tick", function () {
                d3
                    .selectAll(".local_word")
                    .attr("x", function (d) {
                        return d.x; //- this.getBBox().width/2;
                    })
                    .attr("y", function (d) {
                        return d.y; // + this.getBBox().height/2;
                    });
            });
    }
}





function filterLocalWordsWithSquareLocality(
    word_positions,
    freq_threshold_lower,
    freq_threshold_upper,
    locality_threshold
) {
    const localised_words = [];
    word_positions.forEach(function (entry) {
        const [word, positions] = entry;
        const xs = [];
        const ys = [];
        positions.forEach(function (pos) {
            const [x, y] = pos;
            xs.push(x);
            ys.push(y);
        });

        const [max_x, min_x] = [Math.max(...xs), Math.min(...xs)];
        const [max_y, min_y] = [Math.max(...ys), Math.min(...ys)];

        const x_range = max_x - min_x;
        const y_range = max_y - min_y;
        if (
            positions.length >= freq_threshold_lower &&
            positions.length <= freq_threshold_upper &&
            x_range < locality_threshold &&
            y_range < locality_threshold
        ) {
            localised_words.push({
                word: word,
                frequency: positions.length,
                x: min_x + x_range / 2,
                y: min_y + y_range / 2,
            });
        }
    });
    return localised_words;
}

function filterLocalWordsWithGaussianLocality(
    word_positions,
    freq_threshold_lower,
    freq_threshold_upper,
    locality_threshold
) {
    // Assume the positions are normally distributed
    let get_mean = function (samples) {
        const sum = samples.reduce((a, b) => a + b, 0);
        const mean = sum / samples.length;
        return mean;
    };

    let get_std = function (samples, mean) {
        if (samples.length <= 1) return 0;
        const acc = samples.reduce((a, b) => a + (b - mean) ** 2, 0);
        return Math.sqrt(acc / (samples.length - 1));
    };

    let get_zscore = function (sample, mean, std) {
        return (sample - mean) / std;
    };

    const localised_words = [];
    word_positions.forEach(function (entry) {
        const [word, positions] = entry;
        if (positions.length < 1) return;
        const xs = [];
        const ys = [];
        positions.forEach(function (pos) {
            const [x, y] = pos;
            xs.push(x);
            ys.push(y);
        });

        const [mean_x, mean_y] = [get_mean(xs), get_mean(ys)];
        const [std_x, std_y] = [get_std(xs, mean_x), get_std(ys, mean_y)];
        // if the word is frequent enough and
        // if 2*std is in locality threshold
        if (
            positions.length >= freq_threshold_lower &&
            positions.length <= freq_threshold_upper &&
            2 * std_x < locality_threshold &&
            2 * std_y < locality_threshold
        ) {
            localised_words.push({
                word: word,
                frequency: positions.length,
                x: mean_x,
                y: mean_y,
            });
        }
    });
    return localised_words;
}


function fontSize(d) {
    return Math.min(15 + d.frequency * 0.2, 80);
}

function forceCollide() {
    const padding = 2;
    const bbox = function (d) {
        const fontsize = fontSize(d);
        const width = d.word.length * 0.5 * fontsize;
        const height = 0.8 * fontsize;
        return {
            x: d.x,
            y: d.y - height,
            width: width,
            height: height,
        };
    };

    function force(alpha) {
        const nodes = force.nodes;
        const quad = d3.quadtree(
            nodes,
            (d) => d.x,
            (d) => d.y
        );
        for (const d of nodes) {
            quad.visit((q, x1, y1, x2, y2) => {
                let updated = false;
                if (q.data && q.data !== d) {
                    const d_bbox = bbox(d);
                    const q_bbox = bbox(q.data);

                    const d_cx = d_bbox.x + d_bbox.width / 2;
                    const d_cy = d_bbox.y + d_bbox.height / 2;

                    const q_cx = q_bbox.x + q_bbox.width / 2;
                    const q_cy = q_bbox.y + q_bbox.height / 2;

                    const x_diff = d_cx - q_cx;
                    const y_diff = d_cy - q_cy;

                    const x_dist = Math.abs(x_diff);
                    const y_dist = Math.abs(y_diff);

                    const x_spacing = d_bbox.width / 2 + q_bbox.width / 2 + padding;
                    const y_spacing = d_bbox.height / 2 + q_bbox.height / 2 + padding;

                    const overlap_x = x_spacing - x_dist;
                    const overlap_y = y_spacing - y_dist;

                    const freq_ratio_d = d.frequency / (d.frequency + q.data.frequency);
                    const freq_ratio_q = 1 - freq_ratio_d;

                    if (overlap_x > 0 && overlap_y > 0) {
                        // collision detected
                        if (overlap_x < overlap_y) {
                            d.x -= overlap_x * freq_ratio_q;
                            q.data.x += overlap_x * freq_ratio_d;
                        } else {
                            d.y -= overlap_y * freq_ratio_q;
                            q.data.y += overlap_y * freq_ratio_d;
                        }
                    }
                }
                return updated;
            });
        }
    }

    // force.initialize = (_) => (nodes = _);
    force.initialize = function(nodes) {
        force.nodes = nodes;
    }

    return force;
}

