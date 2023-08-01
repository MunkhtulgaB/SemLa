import { updateRelationChart, 
        updateImportanceChart,
        updateTokenChart,
        loadingImportanceChart, 
        emptyRelationChart, 
        emptyTokenChart } from "./instance-level.js";
import { populateConfusionTable,
        populateIntentTable } from "./intent-level.js";
import { drawHulls } from "./global-level/hulls.js";
import { clear, 
         filterByIntents, 
         filterByConfidence,
         filterByDatapoint, 
         filterChart, 
         filterHulls,
         getVisibleDatapoints, 
         calculateConfidence } from "./global-level/filters.js";
import { showLocalWords } from "./global-level/local-words.js";
import { initializeMap } from "./global-level/map.js";


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

let updateLocalWords = function(disableForce) {
    let [visibles, __, ___] = getVisibleDatapoints(width, height); // TO REFACTOR: reduce the call to getVisibleDatapoints(width, height) when updateSymbols is called in the same context
    showLocalWords(visibles, disableForce);
}




















// INIT the SVG






// make widgets collapsible
$(".widget_title").click(function () {
    $(this).parent().find(".widget_content").slideToggle();
});

// set the dimensions and margins of the graph
let margin = { top: 10, right: 30, bottom: 30, left: 60 },
    width = 1000 - margin.left - margin.right,
    height = 900 - margin.top - margin.bottom,
    bbox = {"width": width, "height": height};

// append the SVG object to the body of the page
let svg_canvas = d3
    .select("svg#semantic_landscape")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .select("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Add a clipPath: everything out of this area won't be drawn.
let clip = svg_canvas.append("defs")
    .append("SVG:clipPath")
    .attr("id", "clip")
    .append("SVG:rect")
    .attr("width", width)
    .attr("height", height)
    .attr("x", 0)
    .attr("y", 0);

svg_canvas.append("line")
    .attr("clip-path", "url(#clip)")
    .attr("id", "drag-line-0")
    .attr("class", "drag_line")
    .style("visibility", "hidden")
    .attr("stroke", "lightblue")
    .attr("stroke-width", "3");
svg_canvas.append("line")
    .attr("clip-path", "url(#clip)")
    .attr("id", "drag-line-1")
    .attr("class", "drag_line")
    .style("visibility", "hidden")
    .attr("stroke", "lightblue")
    .attr("stroke-width", "3");

let dim_reduction = "tsne";




















































// GLOBAL CONSTANTS


let previous_intent_symbol_map = {};


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














































// Map initialization



































































// Load data
const DATASETS = ["banking", "hwu", "clinc"];
const DATASET_NAME = "banking";
const NUM_CLUSTERS = 12;

$("#dataset_name").html(`<b>${DATASET_NAME.toUpperCase()}</b>`);

d3.json(
    `static/data/${DATASET_NAME.toLowerCase()}-viz_data-${NUM_CLUSTERS}-clusters-intent_cluster_chosen_by_majority_in-predicted-intent.json`,
    function (data) {
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
            filterByIntentsAndUpdate(data, intents, bbox);
        }

        let filterBySelectedConfusion = function() {
            const gt = d3.select(this).attr("gt");
            const pred = d3.select(this).attr("pred");
            filterByIntentsAndUpdate(data, [gt, pred], bbox);

            $(".selected-tr").removeClass("selected-tr");
            $(this).addClass("selected-tr");
        }

        const [intents_to_points_tsne, intents_to_points_umap] = 
                initializeMap(svg_canvas, 
                                margin,
                                width, 
                                height, 
                                data, 
                                cluster_to_color, 
                                intent_to_cluster,
                                dim_reduction,
                                updateLocalWords,
                                onClick,
                                updateRelationChart,
                                DATASET_NAME);
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











































// On click, start instance-level explanations




















function onClick(d, data, newX, newY) {
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
    const support_dps = d.support_set.map((idx) => data[idx]);
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





