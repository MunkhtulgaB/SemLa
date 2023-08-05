import { updateRelationChartFromCache,
        updateImportanceChartFromCache,
        updateTokenChartFromCache,
        updateRelationChart,
        updateTextSummary,
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
         calculateConfidence,
         FilterView } from "./global-level/filters.js";
import { showLocalWords } from "./global-level/local-words.js";
import { MapView } from "./global-level/map.js";
import { ExplanationSet } from "./explanation.js";
import { Dataset, Filter } from "./data.js"
import { initializeTooltip, 
         showTooltip, 
         moveTooltipToCursor,
         hideTooltip } from "./global-level/tooltip.js";


// Wrappers around the filter functions
let filterBySearch = function(data, search_phrases) {
    const filter_idxs = filterBySubstring(data, search_phrases);
    const filter = new Filter("Search", "", filter_idxs);
    return filter;
}

let filterByIntentsAndUpdate = function(data, intents, bbox) {
    const filter_idxs = filterByIntents(data, intents, bbox);
    const filter = new Filter("Intent", "", filter_idxs);
    return filter;
}

let filterByConfidenceAndUpdate = function(data, 
                                            conf_threshold_lower,
                                            conf_threshold_upper) {
    const filter_idxs = filterByConfidence(data, 
                                            conf_threshold_lower, 
                                            conf_threshold_upper);
    const filter = new Filter("Confidence", "", filter_idxs);
    return filter;
}

let filterByDatapointAndUpdate = function(dp, data) {
    const filter_by = $('input[name="filter-by"]:checked').val();
    const filter_idxs = filterByDatapoint(dp, data, filter_by);
    const filter = new Filter("Datapoint", "", filter_idxs);
    return filter;
}

let updateLocalWords = function(disableForce) {
    let [visibles, __, ___] = getVisibleDatapoints(width, height);
    showLocalWords(visibles, disableForce);
}

let addTooltip = function(selector, content) {
    const selected_element = $(selector);
    selected_element.on("mouseover", function() {
        showTooltip("super-tooltip", content)
        moveTooltipToCursor("#super-tooltip", 
                                {X: 20, Y: 0});
    })
    .on("mouseout", () => hideTooltip("#super-tooltip"));
}


// make widgets collapsible
$(".widget_title").click(function () {
    $(this).parent().find(".widget_content").slideToggle();
});

// set the dimensions and margins of the graph
let margin = { top: 10, right: 30, bottom: 30, left: 60 },
    width = 1220 - margin.left - margin.right,
    height = 1090 - margin.top - margin.bottom,
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


let dim_reduction = "tsne";
        
const NUM_CLUSTERS = 12;
const system_config = {
    dataset: "banking",
    model: "bert"
}


$(document)
    .ready(function () {

    initializeTooltip("super-tooltip", "super-container",
                        "black", "white", 0.95);
    initializeDragLines();
    initializeSystem(system_config.dataset, system_config.model);

    $("#model-select").change(function() {
        const model = $(this).val();
        system_config.model = model;
        system_config.dataset = "banking";

        if (model == "GPT") {
            // disable unavailable dataset options
            $("#dataset-select option:contains('HWU')")
                .attr("disabled", "disabled");
            $("#dataset-select option:contains('CLINC')")
                .attr("disabled", "disabled");

            // select an available option
            $("#dataset-select").val("banking").change();
            

        } else {
            // enable all dataset options
            $("#dataset-select option:contains('HWU')")
                .attr("disabled", false);
            $("#dataset-select option:contains('CLINC')")
                .attr("disabled", false);
            clearSystem();
            initializeSystem(system_config.dataset, 
                            system_config.model);
        }
    });

    $("#dataset-select").change(function() {
        const dataset = $(this).val();
        system_config.dataset = dataset;
        clearSystem();
        initializeSystem(system_config.dataset, 
                        system_config.model);

    });
});


function clearSystem() {
    svg_canvas.html(null);
    // Add a clipPath: everything out of this area won't be drawn.
    svg_canvas.append("defs")
    .append("SVG:clipPath")
    .attr("id", "clip")
    .append("SVG:rect")
    .attr("width", width)
    .attr("height", height)
    .attr("x", 0)
    .attr("y", 0);

    $("#intent_filter").html(`<option value=""></option>`);
    $("#confusion-table").html(`
        <tr>
            <th column_type="gt" class="small_td">Ground truth</th>
            <th column_type="pred" class="small_td">Prediction</th>
            <th column_type="num_confusions" class="xs_td"># confusions</th>
        </tr>
    `);
    $("#summary").empty();
    $("#importance-chart-container").html(`
        <canvas id="importance_chart"></canvas>
    `);
    $("#relchart-container").html(`
        <div id="rel_chart_left_container" style="height: 100%; width: 0px; display: inline-block;"> 
            <svg id="rel_chart_left" style="height: 100%; width: 100%"></svg>
        </div>
        <div id="rel_chart_right_container" class="rel_chart_right" style="height: 100%;">
            <svg id="rel_chart" style="height: 100%; width: 100%"></svg>
        </div>
    `);
    $("#tokenchart-container").html(`
        <div id="token_chart_left_container" style="height: 100%; width: 0px; display: inline-block;"> 
            <svg id="token_chart_left" style="height: 100%; width: 100%"></svg>
        </div>
        <div id="token_chart_right_container" class="rel_chart_right" style="height: 100%;">
            <svg id="token_chart" style="height: 100%; width: 100%"></svg>
        </div>
    `);
    initializeDragLines();      
}


function initializeSystem(dataset_name, model) {
    // Load data
    $("#dataset_name").html(`<b>${dataset_name.toUpperCase()}</b>`);

    d3.json(
        `static/data/${dataset_name.toLowerCase()}-viz_data-${NUM_CLUSTERS}-clusters-intent_cluster_chosen_by_majority_in-predicted-intent-with-${model.toLowerCase()}.json`,
        function (data) {
            const cluster_to_color = d3.schemeSet3;
            const dataset = new Dataset(data);
            const explanations = new ExplanationSet(dataset_name);

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

            const filter_view = new FilterView(dataset);
            const map = new MapView(svg_canvas, 
                                    margin,
                                    width, 
                                    height, 
                                    dataset,
                                    explanations,
                                    cluster_to_color, 
                                    dataset.intentToCluster,
                                    dim_reduction,
                                    updateLocalWords,
                                    (model == "GPT")? onClickSummaryOnly : onClick,
                                    updateRelationChart,
                                    dataset_name);
            populateIntentTable(dataset.clusterToIntent, 
                                cluster_to_color, 
                                filterBySelectedIntents);
            populateConfusionTable(dataset.confusions, 
                                    dataset.gtCounts, 
                                    dataset.predCounts,
                                    filterBySelectedConfusion);

            const accuracy = 100 - (dataset.errors.length / data.length) * 100;
            $("#accuracy").html(`<b>${accuracy.toFixed(1)}</b>`);

            initializeControlWidgets(dataset, map, cluster_to_color);
    });
}


function initializeControlWidgets(dataset, map, cluster_to_color) {
    // Initialize the input widgets
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
    addTooltip("label[for=show-local-words]", "Show localized features");
    addTooltip("label[for=how-many-grams]", "Show localized n-grams instead of unigrams");
    addTooltip("label[for=ignore-stopwords]", "Do not show stop words");
    

    // Local word (feature) type
    $("#local-feature-type-select").change(function() {
        if ($(this).val() != "text") {
            d3.select("#word-only-options").style("visibility", "hidden");
        } else {
            d3.select("#word-only-options").style("visibility", "visible");
        }
        updateLocalWords();
    })
    addTooltip("label[for=local-feature-type-select]", 
                `Select the type of feature you would like to investigate the localization of.
                <br>For example, choose feature type "Gold label" to see where certain labels are localized.`)

    // Locality shape
    $('input[name="locality-shape"]').change(updateLocalWords);
    addTooltip(
        "label[for=locality-shape]", 
        `The square locality shape requires all occurrences of the shown localized features to be strictly contained <br>
        within the locality threshold size, i.e., does not allow outliers.
        <br>The Gaussian locality shape allows outliers.`
    )

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
        .on("change", function() {
            updateLocalWords
        })
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
    addTooltip(
        "label[for=localAreaThreshold]",
        `The size of the locality is defined by this threshold.
        <br>
        The red box that appears on the map as you move the slider indicates the current threshold size.
        The shown features are localized within the same size box as this.
        `
    )
    $("#invert").change(updateLocalWords);
    addTooltip(
        "label[for=invert]",
        `<p>Checking "Invert" will show features that are opposite of localized, 
        i.e., <i>outside</i> the locality threshold. <br>    This can for example be used to 
        identify the least localized labels as opposed to the most localized.
        </p>
        By default, when unchecked, the shown features are localized <i>within<i> the threshold.
        `
    )

    // Frequency threshold
    $("input.freqThreshold").change(updateLocalWords);
    addTooltip(
        "label[for=freqThreshold]",
        `The frequency of the shown localized features (across all currently visible nodes) is within this range.`
    );

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
        const conf_threshold_lower =
            parseInt($("input.confThreshold[data-index=0]").val()) || 0;
        const conf_threshold_upper =
            parseInt($("input.confThreshold[data-index=1]").val()) || 100;
        
        if (conf_threshold_lower == 0 && 
            conf_threshold_upper == 100) {
            dataset.removeFilter("Confidence")
        } else {
            const filter = filterByConfidenceAndUpdate(dataset.data,
                conf_threshold_lower,
                conf_threshold_upper);
            dataset.addFilter(filter);
        }
    });

    // Show local words?
    is_to_show_errors_only.change(updateLocalWords);

    // Filter input
    search_input.on("input", function (e) {
        const search_value = e.target.value;
        if (search_value == "") {
            dataset.removeFilter("Search")
        } else {
            const search_phrases = search_value.split(";");
            const filter = filterBySearch(dataset.data, search_phrases);
            dataset.addFilter(filter);
        }
    });

    // Clear button
    clear_btn.on("click", function (e) {
        resetFilterControls();
        dataset.clearFilters();
    });

    $(document).keyup(function(e) {
        if (e.key == "Escape") {
            resetFilterControls();
            dataset.clearFilters();
        }
    });
}


function resetFilterControls() {
    $("#filter").val("");
    $("#show-errors").prop("checked", false);
    $("input.confThreshold[data-index=0]").val(0).change();
    $("input.confThreshold[data-index=1]").val(100).change();
}


function onClick(d, dataset, explanation_set) {
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

    const tok2sim_relations = explanation_set.token2similarity_relations;
    const importances = explanation_set.importances;
    const tok2token_relations =  explanation_set.token2token_relations;
    updateRelationChartFromCache(tok2sim_relations[d.idx].right);
    updateRelationChartFromCache(tok2sim_relations[d.idx].left);
    updateImportanceChartFromCache(importances[d.idx]);
    updateTokenChartFromCache(tok2token_relations[d.idx].right);
    updateTokenChartFromCache(tok2token_relations[d.idx].left);

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


let alertCount = 0;

function onClickSummaryOnly(d, dataset, explanation_set) {
    // Filter the related nodes and highlight the selected node
    const data = dataset.data;
    const newFilter = filterByDatapointAndUpdate(d, data);
    dataset.addFilter(newFilter);
    
    console.log(calculateConfidence(d));
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

    if (alertCount == 0) {
        alert("Instance-level explanation data for this model is currently unavailable. Only a simple summary will be shown.");
        alertCount++;
    }
}


function initializeDragLines() {
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
}