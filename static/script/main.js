import { updateRelationChart, 
        updateImportanceChart,
        updateTextSummary,
        updateTokenChart,
        loadingImportanceChart, 
        emptyRelationChart, 
        emptyTokenChart } from "./instance-level.js";
import { populateConfusionTable,
        populateIntentTable } from "./intent-level.js";
import { filterByIntents, 
         filterBySubstring,
         filterByConfidence,
         filterByDatapoint,
         getVisibleDatapoints, 
         calculateConfidence } from "./global-level/filters.js";
import { showLocalWords } from "./global-level/local-words.js";
import { Map } from "./global-level/map.js";
import { updateSymbols } from "./global-level/symbols.js";
import { Dataset, Filter } from "./data.js"


// Wrappers around the filter functions
let filterBySearch = function(data, search_phrases) {
    const filter_idxs = filterBySubstring(data, search_phrases);
    const filter = new Filter("Search", "", filter_idxs);
    return filter;
}

let filterByIntentsAndUpdate = function(data, intents, bbox) {
    const filter_idxs = filterByIntents(data, intents, bbox);
    const filter = new Filter("Intent", "", filter_idxs);
    // let [visibles, gold_intent_set, _] =
    //     getVisibleDatapoints(width, height);
    // updateSymbols(visibles, gold_intent_set);
    // updateLocalWords();
    return filter;
}

let filterByConfidenceAndUpdate = function(data) {
    const conf_threshold_lower =
        parseInt($("input.confThreshold[data-index=0]").val()) || 0;
    const conf_threshold_upper =
        parseInt($("input.confThreshold[data-index=1]").val()) || 100;
    const filter_idxs = filterByConfidence(data, 
                                            conf_threshold_lower, 
                                            conf_threshold_upper);
    const filter = new Filter("Confidence", "", filter_idxs);
    // let [visibles, gold_intent_set, _] =
    //     getVisibleDatapoints(width, height);
    // updateSymbols(visibles, gold_intent_set);
    // updateLocalWords();
    return filter;
}

let filterByDatapointAndUpdate = function(dp, data) {
    const filter_by = $('input[name="filter-by"]:checked').val();
    const filter_idxs = filterByDatapoint(dp, data, filter_by);
    const filter = new Filter("Datapoint", "", filter_idxs);

    // let [visibles, gold_intent_set, _] =
    //     getVisibleDatapoints(width, height);
    // updateSymbols(visibles, gold_intent_set);
    // updateLocalWords();
    return filter;
}

let updateLocalWords = function(disableForce) {
    let [visibles, __, ___] = getVisibleDatapoints(width, height);
    showLocalWords(visibles, disableForce);
}



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

// Add the lines that appear when you drag from a node
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



// Load data
const DATASETS = ["banking", "hwu", "clinc"];
const DATASET_NAME = "banking";
const NUM_CLUSTERS = 12;

$("#dataset_name").html(`<b>${DATASET_NAME.toUpperCase()}</b>`);

d3.json(
    `static/data/${DATASET_NAME.toLowerCase()}-viz_data-${NUM_CLUSTERS}-clusters-intent_cluster_chosen_by_majority_in-predicted-intent.json`,
    function (data) {
        const cluster_to_color = d3.schemeSet3;
        const dataset = new Dataset(data);

        // Initialize the global and intent level visualizations
        let filterBySelectedIntents = function() {
            const intents = $(this).val();
            const filter = filterByIntentsAndUpdate(data, intents, bbox);
            dataset.addFilter(filter)
            map.filterHulls(intents)
        }

        let filterBySelectedConfusion = function() {
            const gt = d3.select(this).attr("gt");
            const pred = d3.select(this).attr("pred");
            const filter = filterByIntentsAndUpdate(data, [gt, pred], bbox);
            dataset.addFilter(filter);
            map.filterHulls([gt, pred])
            
            $(".selected-tr").removeClass("selected-tr");
            $(this).addClass("selected-tr");
        }

        const map = new Map(svg_canvas, 
                                margin,
                                width, 
                                height, 
                                dataset, 
                                cluster_to_color, 
                                dataset.intentToCluster,
                                dim_reduction,
                                updateLocalWords,
                                onClick,
                                updateRelationChart,
                                DATASET_NAME);
        populateIntentTable(dataset.clusterToIntent, 
                            cluster_to_color, 
                            filterBySelectedIntents);
        populateConfusionTable(dataset.confusions, 
                                dataset.gtCounts, 
                                dataset.predCounts,
                                filterBySelectedConfusion);

        const accuracy = 100 - (dataset.errors.length / data.length) * 100;
        $("#accuracy").html(`<b>${accuracy.toFixed(1)}</b>`);

        // Initialize the input widgets
        $(document)
            .ready(function () {
                const dim_reduction_option = $('input[name="dim-reduction"]');
                const groupby_option = $('input[name="group-by"]');
                const filterby_option = $('input[name="filter-by"]');
                const is_to_show_errors_only = $("#show-errors");
                const search_input = $("#filter");
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
                    map.switchDimReduction(dim_reduction);
                    updateLocalWords();
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
                    const filter = filterByDatapointAndUpdate(d[0], data);
                    dataset.addFilter(filter);
                });

                // Show errors only?
                is_to_show_errors_only.on("change", function() {
                    if ($("#show-errors").is(":checked")) {
                        const filter = new Filter("Errors", "", dataset.errors_idxs);
                        dataset.addFilter(filter);
                    } else {
                        dataset.removeFilter("Errors");
                    }
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
                $("input.confThreshold").change(() => {
                    const filter = filterByConfidenceAndUpdate(data);
                    dataset.addFilter(filter);
                });

                // Show local words?
                is_to_show_errors_only.change(updateLocalWords);

                // Filter input
                search_input.on("input", function (e) {
                    const search_value = e.target.value;
                    const search_phrases = search_value.split(";");
                    const filter = filterBySearch(data, search_phrases);
                    dataset.addFilter(filter);
                });

                // Clear button
                clear_btn.on("click", function (e) {
                    resetFilterControls();
                    dataset.clearFilters();
                });
            })
            .keyup(function (e) {
                if (e.key === "Escape") {
                    // escape key maps to keycode `27`
                    resetFilterControls();                   
                    dataset.clearFilters();
                }
            });
    }
);


function resetFilterControls() {
    $("#filter").val("");
    $("#show-errors").prop("checked", false);
    $("input.confThreshold[data-index=0]").val(0);
    $("input.confThreshold[data-index=1]").val(100);
}


function onClick(d, dataset) {
    // Filter the related nodes and highlight the selected node
    const data = dataset.data;
    const newFilter = filterByDatapointAndUpdate(d, data);
    dataset.addFilter(newFilter);
    
    // Identify the closest datapoint
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

    updateTextSummary(d, closest_dp, dp2);
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
        // if the nodes are currently filtered out, show them half transparent
        const closest_node =  d3.select(`#node-${closest_dp.idx}`);
        const dp2_node = d3.select(`#node-${dp2.idx}`);

        closest_node
            .style("opacity", function() {
                if (closest_node.style("visibility") == "hidden") {
                    return 0.3;
                }
            })
            .style("visibility", "visible");
        dp2_node
            .style("opacity", function() {
                if (dp2_node.style("visibility") == "hidden") {
                    return 0.3;
                }
            })
            .style("visibility", "visible");

        d3.select("#drag-line-0")
            .attr("x1", (d[`${dim_reduction}-dim0`]))
            .attr("y1", (d[`${dim_reduction}-dim1`]))
            .attr("x2", (closest_dp[`${dim_reduction}-dim0`]))
            .attr("y2", (closest_dp[`${dim_reduction}-dim1`]))
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
            .attr("x1", (d[`${dim_reduction}-dim0`]))
            .attr("y1", (d[`${dim_reduction}-dim1`]))
            .attr("x2", (dp2[`${dim_reduction}-dim0`]))
            .attr("y2", (dp2[`${dim_reduction}-dim1`]))
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