import { ImportanceView,
         Token2SimilarityRelationView,
         Token2TokenRelationView } from "./instance-level.js";
import { populateConfusionTable,
        populateLabelTable } from "./label-level.js";
import { filterBySubstring,
         filterByConfidence,
         FilterView } from "./global-level/filters.js";
import { hideProgress, LocalWordsView } from "./global-level/local-words.js";
import { MapView } from "./global-level/map.js";
import { ExplanationSet } from "./explanation.js";
import { Dataset, Filter } from "./data.js"
import { initializeTooltip, addTooltip } from "./global-level/tooltip.js";
import { ListView } from "./global-level/list-view.js";


// Wrappers around the filter functions
let filterBySearch = function(data, search_phrases) {
    const filter_idxs = filterBySubstring(data, search_phrases);
    const filter = new Filter("Search", "", filter_idxs);
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


let margin;
let width;
let height;

let svg_canvas;
let clip;

let svg_canvas1;
let clip1;
    

let dim_reduction = "tsne";
        
const MODEL_DATASET_AVAILABILITY = {
    "gpt": ["banking", "go_emotions", "medical-bios"],
    "bert": ["banking", "hwu", "clinc"],
    "roberta": ["go_emotions", "sst5"],
    "bert-60": ["banking"],
    "bert-40": ["banking"],
    "bert-20": ["banking"],
    "bert-0": ["banking"],
};
const NUM_CLUSTERS = 12;
const system_config = {
    dataset: "hwu",
    model: "bert"
}

const WIDTH = 1000;
const HEIGHT = 480;


$(document)
    .ready(function () {

    $("#model-select").change(function() {
        const model = $(this).val();
        system_config.model = model;
        system_config.dataset = MODEL_DATASET_AVAILABILITY[model][0];

        // disable all options first
        $("#dataset-select option")
        .attr("disabled", "disabled");

        // enable available options
        MODEL_DATASET_AVAILABILITY[model].forEach(dataset => {
            $(`#dataset-select option[value=${dataset}]`)
                .attr("disabled", false);
        })


        // select an available option
        $("#dataset-select").val(system_config.dataset).change();
        // uncheck confidence heatmap toggle
        $("#show-confidence").prop("checked", false);
    });

    $("#dataset-select").change(function() {
        const dataset = $(this).val();
        system_config.dataset = dataset;
        clearSystem();
        initializeSystem(system_config.dataset, 
                        system_config.model);

    });

    // Comparison mode
    $("#compare-mode").change(function() {
        $(".map-view-header").css("display", "none");
        $("#filter-container-1").css("display", "none");
        clearSystem();
        initializeSystem(system_config.dataset, 
                        system_config.model);
    })
    
    // disable all options first
    $("#dataset-select option")
    .attr("disabled", "disabled");

    // enable available options
    MODEL_DATASET_AVAILABILITY[system_config.model].forEach(dataset => {
        $(`#dataset-select option[value=${dataset}]`)
            .attr("disabled", false);
    })
    
    initializeSystem(system_config.dataset, system_config.model);
    initializeTooltip("super-tooltip", "super-container");
    initializeHelpTooltips();
    initializeModal();
});


function clearSystem() {
    const is_in_compare_mode = $("#compare-mode").is(":checked");
    margin = { top: 10, right: 30, bottom: 30, left: 60 };
    width = ((is_in_compare_mode) ? WIDTH/2 : WIDTH) - margin.right;
    height = HEIGHT;

    svg_canvas.html(null);
    if (svg_canvas1) svg_canvas1.html(null);

    $("#label_filter").html(`<option value=""></option>`);
    $("#confusion-table").html(`
        <thead>
            <tr>
                <th column_type="gt" sort_dir="desc" class="sortable-column-header small_td">Ground truth <span class="sort-arrow">&darr;</span></th>
                <th column_type="pred" sort_dir="desc"  class="sortable-column-header small_td">Prediction <span class="sort-arrow">&darr;</span></th>
                <th column_type="num_confusions" sort_dir="desc" class="sortable-column-header xs_td"># confusions <span class="sort-arrow">&darr;</span></th>
            </tr>
        </thead>
        <tbody>
        </tbody>
    `);
    $("#summary").empty();
    $("#importance-chart-container").html(`
        <canvas id="importance_chart"></canvas>
    `);
    $("#rel-chart-container").html("");
    $("#token-chart-container").html("");
}


function initializeSystem(dataset_name, model) {
    const is_in_compare_mode = $("#compare-mode").is(":checked");
    margin = { top: 10, right: 10, bottom: 10, left: 20 };
    width = ((is_in_compare_mode) ? WIDTH/2 : WIDTH) - margin.left - margin.right;
    height = HEIGHT;

    svg_canvas = d3
        .select("svg#semantic_landscape")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .select("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    clip = svg_canvas.append("defs")
        .append("SVG:clipPath")
        .attr("id", "clip")
        .append("SVG:rect")
        .attr("width", width)
        .attr("height", height)
        .attr("x", 0)
        .attr("y", 0);
    
    // Load data
    $("#dataset_name").html(`<b>${dataset_name.toUpperCase()}</b>`);
    $("#model-select").val(model);
    $("#dataset-select").val(dataset_name);

    d3.json(
        `static/data/${dataset_name.toLowerCase()}-viz_data-${NUM_CLUSTERS}-clusters-label_cluster_chosen_by_majority_in-predicted-label-with-${model.toLowerCase()}.json`,
        function (data) {
            const cluster_to_color = d3.schemeSet3;
            const dataset = new Dataset(data);
            const explanations = new ExplanationSet(dataset_name);

            // Initialize the global and label level visualizations
            let filterBySelectedLabels = function(elem) {
                // Control in label & cluster widget
                const hullClasses = [];
                $(".show-label-group:checked").each(function(e) {
                    hullClasses.push($(this).val());
                });
                    
                const labels = $(elem).val();
                map.selectLabels(labels);
                if (map1) map1.selectLabels(labels);
            }

            let filterBySelectedConfusion = function() {
                const gt = d3.select(this).attr("gt");
                const pred = d3.select(this).attr("pred");

                map.selectLabels([gt, pred]);
                if (map1) map1.selectLabels([gt, pred]);
                
                $(".selected-tr").removeClass("selected-tr");
                $(this).addClass("selected-tr");
            }

            const local_words_view = new LocalWordsView(
                                    "semantic_landscape", 
                                    width, 
                                    height,
                                    dataset);
            let local_words_view1;

            const filter_view = new FilterView("current-filters", dataset);
            let onFilterRemove = function() {
                const filterType = $(this).attr("data");
                filter_view.undoFilter(filterType);
                if (filter_view1) filter_view1.undoFilter(filterType);
            };
            filter_view.setOnRemove(onFilterRemove);
            const list_view = new ListView(local_words_view);

            list_view.observe(local_words_view);

            let updateBothLocalWordViews = function(isHighFrequencyCall) {
                local_words_view.update(isHighFrequencyCall);
                if (local_words_view1) local_words_view1.update(isHighFrequencyCall);
            }

            const map = new MapView("semantic_landscape",
                                    svg_canvas, 
                                    margin,
                                    width, 
                                    height, 
                                    dataset,
                                    explanations,
                                    cluster_to_color, 
                                    dataset.labelToCluster,
                                    dim_reduction,
                                    updateBothLocalWordViews,
                                    dataset_name,
                                    model,
                                    NUM_CLUSTERS,
                                    MODEL_DATASET_AVAILABILITY,
                                    is_in_compare_mode);
            local_words_view.addObserver(map);

            let map1;
            let dataset1;
            let filter_view1;

            if (is_in_compare_mode) {
                $(".map-view-header").css("display", "block");
                svg_canvas1 = d3
                    .select("svg#semantic_landscape-mirror")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom)
                    .select("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

                clip1 = svg_canvas1.append("defs")
                    .append("SVG:clipPath")
                    .attr("id", "clip1")
                    .append("SVG:rect")
                    .attr("width", width)
                    .attr("height", height)
                    .attr("x", 0)
                    .attr("y", 0);
                    
                $("#filter-container-1").css("display", "block");
                dataset1 = new Dataset(data);
                filter_view1 = new FilterView("current-filters-1", dataset1);
                filter_view1.setOnRemove(onFilterRemove);
                
                local_words_view1 = new LocalWordsView(
                    "semantic_landscape-mirror", 
                    width, 
                    height,
                    dataset1);

                map1 = new MapView("semantic_landscape-mirror",
                                svg_canvas1, 
                                margin,
                                width, 
                                height, 
                                dataset1,
                                explanations,
                                cluster_to_color, 
                                dataset.labelToCluster,
                                dim_reduction,
                                updateBothLocalWordViews,                         
                                dataset_name,
                                model,
                                NUM_CLUSTERS,
                                MODEL_DATASET_AVAILABILITY,
                                is_in_compare_mode);
                map1.addParallelMap(map);

                local_words_view1.addObserver(map1);
                list_view.observe(local_words_view1);
            }

            populateLabelTable(dataset.clusterToLabel, 
                                cluster_to_color, 
                                filterBySelectedLabels);
            populateConfusionTable(dataset.confusions, 
                                    dataset.gtCounts, 
                                    dataset.predCounts,
                                    filterBySelectedConfusion);

           
            const predictions = dataset.data.map(x => x.prediction);
            const labels = dataset.data.map(x => x.ground_truth);

            let count_correct = 0;
            for (let i = 0; i < predictions.length; i++) {
                if (predictions[i] == labels[i]) {
                    count_correct++;
                }
            }
            const accuracy = 100 * (count_correct / predictions.length);
            // const accuracy = 100 - (dataset.errors.length / data.length) * 100;
            $("#accuracy").html(`<b>${accuracy.toFixed(1)}</b>`);
            
            initializeControlWidgets(dataset, dataset1, map, map1, cluster_to_color, local_words_view, local_words_view1, filter_view, filter_view1);
            initializeAdvancedOptionToggle();
        });
}

const HIDE = "hide";
const SHOW = "show"
const UP_TRIANGLE = "&#x25B2;";
const DOWN_TRIANGLE = "&#x25BC;";

function initializeAdvancedOptionToggle() {
    const advanced_option_toggle = $(".advanced-option-toggle");
    advanced_option_toggle.unbind("click");
    advanced_option_toggle.click(function() {
        const current_value = $(this).attr("value");
        const container = $(this).parent().parent();

        if (current_value == HIDE) {
            $(this).attr("value", SHOW);
            $(this).html(UP_TRIANGLE);
            container.find(".advanced-option").slideDown();
            $("#corpus-level").animate({height: "722px"});
        } else if (current_value == SHOW) {
            $(this).attr("value", HIDE);
            $(this).html(DOWN_TRIANGLE);
            container.find(".advanced-option").slideUp();
            $("#corpus-level").animate({height: "705px"});
        }
    })
}

function initializeHelpTooltips() {
    addTooltip("#info-filter-options", `<p>The options below allow you to select 
                                        <b>which datapoints</b> (circles) are shown on
                                        the map above.</p>
                                        
                                        <p>For example, you can <i>search</i>
                                        datapoints containing a certain word (substring) or you can choose
                                         to show only those datapoints
                                        for which the model made an erroneous prediction.</p>
                                        
                                        <p>Hover over each option for further details.</p>`);
    addTooltip("#info-local-words", `<p>The options below allow you to control 
                                     the <b>text</b> visualized over the datapoints in the map above.</p>
                                     
                                     <p>The words represent features of 
                                     a selected type and their "locations". For example, if you select type "Concept"
                                     using the dropdown list and a small locality threshold 
                                     using the slider, then you will see only concepts that are 
                                     highly localized (as opposed to spread-out) on their respective
                                     locations on the map.
                                     </p>
                                     
                                     <p>Hover over each option for further details.</p>`);
    addTooltip("#info-map-options", `The basic options below allow you to select which
                                     <b>dataset and model</b> to load for analysis, which dimension 
                                     reduction to use, and whether to color the datapoints
                                     based on model confidence.`);
    addTooltip("#info-map-header", `<p>This interactive visualization allows you to analyze a model 
                                    and/or a dataset at both the <b>global level</b> and more fine-grained levels, using a "map", which shows datapoints of
                                     the dataset in the embedding space of the model.</p>
                                     
                                    <p>The high-dimensional embeddings of the datapoints are 
                                    projected to 2D using dimension reduction. You can 
                                    freely explore this projected space using zooming and panning,
                                    and navigate its various localities using the "Localized features options" and
                                    the "Filter options".</p>`);
    addTooltip("#info-labels-clusters", `<p>The list below shows <b>all labels</b> in their 
                                        respective cluster groups. 
                                        </p>
                                        
                                        <p>
                                        It provides to option to select one or multiple labels to 
                                        analyze them on the map view. For example, if you select a 
                                        single label, only datapoints <b>predicted by the model</b>
                                         to have that label will be shown on the map.
                                        </p>

                                        <p>
                                        It is also possible to compare a predicted group 
                                        (datapoints predicted as having label x) against the 
                                        ground-truth group (datapoints that actually have label x).
                                        </p>`);

    addTooltip("#info-confusions", `<p>
                                        The table below shows the <b>model's confusions</b>.
                                        Clicking on the column headers sorts the confusions 
                                        by the selected column.
                                    </p>
                                    <p>
                                        The first two columns sorts by how frequently the label
                                        has appeared as either the "ground-truth" or the "prediction"
                                        in the model's confusions. For example, sorting by "ground-truth"
                                        will allow quickly identifying which labels had the most or least 
                                        false negatives.
                                    </p>
                                    <p>
                                        The last column sorts the confusions by how many times the
                                        model made errors with the exact two labels in the row.
                                    </p>
                                    `);
    addTooltip("#info-sample-summary", `
                                    <p>
                                        Summarizes the <b>key information</b> relevant to the 
                                        selected sample, which include 
                                        the texts and the labels associated with the 
                                        <b>selected</b> sample x itself and two related samples:
                                        the <b>closest</b> sample to x whose label is the predicted label of x,
                                        and a <b>contrast</b> sample that either has the ground-truth label of x
                                        or another similar label.
                                    </p>
                                    `);
    addTooltip("#info-feature-importance", `
                        <p>
                        Shows the <b>importance of each feature</b> in the selected sample.
                        </p>
                        <p>
                        Each feature's importance, represented by a composite bar,
                        is the total of normalized importance score from four 
                        different feature importance estimation methods.
                        </p>
                        <p>
                        By comparing the segments in each bar, it is possible to see 
                        whether the different estimation methods agree with each other.
                        </p>
                        <p>
                        You can also choose to use only one or a subset of the 
                        estimation methods by disabling the rest of the methods by
                        clicking on their names that appear in the legend below the chart.
                        </p>`);
    addTooltip("#info-tokenchart", `
                        <p>
                        Shows the <b>token-to-token links</b> between the selected sample and its two related samples.
                        </p>
                        <p>
                        It's possible to show only the top-k links per each related sample.
                        </p>
                        `);
    addTooltip("#info-relchart", `
                        <p>
                        Shows the <b>token-to-similarity links</b> that represent the contribution of each 
                        token to the similarity between the samples.
                        </p>    
                        <p>
                        It's possible to show only the top-k links per each sample.
                        </p>`);
    addTooltip("#info-list-view", `
                        <p>
                        This view <b>complements</b> the "Map view"
                        by showing the 
                        local concepts, words, and labels (predicted and ground-truth)
                        in the currently visible datapoints all simultaneously.
                        </p>
                        `);

    addTooltip("#info-sample-level", `
                        <p>
                        The visualizations below provide <b>sample-level</b> explanations.
                        </p>`);

    addTooltip("#info-label-level", `
                        <p>
                        The widgets below allow you to analyze 
                        the model and dataset at <b>the label level</b>.
                        </p>`);
    addTooltip("#info-local-concepts", `
                        <p>
                        The local <b>concepts</b> extracted from the current datapoints on the "Map view" 
                        (<b>sorted by probability</b> calculated based on the currently visible datapoints).
                        </p>
                        
                        <p>
                        <b>In comparison mode</b>, these are sorted by <b>contrastiveness</b>,
                        the difference in probability of occurring in "Group 1"
                        versus in "Group 2".
                        </p>`);
    addTooltip("#info-local-words-list", `
                        <p>
                        The local <b>words</b> extracted from the current datapoints on the "Map view" 
                        (<b>sorted by probability</b> calculated based on the currently visible datapoints).
                        </p>
                        
                        <p>
                        <b>In comparison mode</b>, these are sorted by <b>contrastiveness</b>,
                        the difference in probability of occurring in "Group 1"
                        versus in "Group 2".
                        </p>`);
    addTooltip("#info-local-gold-labels", `
                        <p>
                        The <b>ground-truth labels</b> of the current datapoints on the "Map view" 
                        (<b>sorted by probability</b> calculated based on the currently visible datapoints).
                        </p>
                        
                        <p>
                        <b>In comparison mode</b>, these are sorted by <b>contrastiveness</b>,
                        the difference in probability of occurring in "Group 1"
                        versus in "Group 2".
                        </p>`);
    addTooltip("#info-local-predicted-labels", `
                        <p>
                        The <b>predicted labels</b> of the current datapoints on the "Map view" 
                        (<b>sorted by probability</b> calculated based on the currently visible datapoints).
                        </p>
                        
                        <p>
                        <b>In comparison mode</b>, these are sorted by <b>contrastiveness</b>,
                        the difference in probability of occurring in "Group 1"
                        versus in "Group 2".
                        </p>`);
    addTooltip(".full-list-toggle", `Click to expand/collapse list`);
    addTooltip(".advanced-option-toggle", "Click to show/hide advanced options");
}


function initializeControlWidgets(dataset, dataset1, map, map1, cluster_to_color, local_words_view, local_words_view1, filter_view, filter_view1) {
    // Initialize the input widgets
    const local_word_toggle = $("#show-local-words");
    const how_many_grams = $("#how-many-grams");
    const show_stopwords = $("#show-stopwords");
    const feature_type = $("#local-feature-type-select");
    const area_threshold = $("#localAreaThreshold");
    const show_confidence = $("#show-confidence");
    const confidence_range = $("input.confThreshold");

    const dim_reduction_option = $('input[name="dim-reduction"]');
    const groupby_option = $('input[name="group-by"]');
    const filterby_option = $('input[name="filter-by"]');
    const is_to_show_errors_only = $("#show-errors");
    const search_input = $("#filter");
    const clear_btn = $("#clear-filter");
    const freq_threshold = $("input.freqThreshold");
    const freq_threshold_concept = $("input.freqThreshold-concept");
    const locality_shape = $('#locality-shape');
    const label_filter = $("#label_filter option");

    // First, remove all the currently registered event handlers
    [local_word_toggle, 
        how_many_grams,
        show_stopwords,
        feature_type,
        area_threshold,
        show_confidence,
        confidence_range,
        dim_reduction_option,
        groupby_option,
        filterby_option,
        is_to_show_errors_only,
        search_input,
        clear_btn,
        freq_threshold,
        freq_threshold_concept,
        locality_shape
    ].forEach((elem) => {
        elem.unbind("change");
        elem.unbind("mouseup");
        elem.unbind("input");
        elem.unbind("click");
    });
    $(document).unbind("keyup");

    let updateBothLocalWordViews = function(isHighFrequencyCall) {
        local_words_view.update(isHighFrequencyCall);
        if (local_words_view1) local_words_view1.update(isHighFrequencyCall);
    }

    // Toggle local words
    local_word_toggle.change(function() {
        const is_to_show_local_words = $("#show-local-words").is(":checked");
        if (!is_to_show_local_words) {
            d3.selectAll(".local_word").remove();
        } else {
            updateBothLocalWordViews();
        }
    });
    how_many_grams.change(updateBothLocalWordViews);
    show_stopwords.change(updateBothLocalWordViews);
    addTooltip("label[for=show-local-words]", "Toggle the localized features");
    addTooltip("label[for=how-many-grams]", `If the feature type is "Word", each feature can be an n-gram instead of a unigram.`);
    addTooltip("label[for=show-stopwords]", "Do not consider stop words");


    // Local word (feature) type
    feature_type.change(function() {
        if (["text", "concept"].includes($(this).val())) {
            d3.selectAll(".word-only-option").style("visibility", "visible");
        } else {
            d3.selectAll(".word-only-option").style("visibility", "hidden");
        }

        if ($(this).val() == "concept") {
            $("#concept-freqThreshold").removeClass("d-none").addClass("d-block");
        } else {
            $("#concept-freqThreshold").removeClass("d-block").addClass("d-none");
        }

        updateBothLocalWordViews();
        hideProgress();
    })
    addTooltip("label[for=local-feature-type-select]", 
                `<p>Select the type of feature that you are interested in 
                analyzing.</p>
                
                <p>For example, choose feature type "Gold label" 
                to see where each label located.</p>`)

    // Locality shape
    locality_shape.change(updateBothLocalWordViews);
    addTooltip(
        "label[for=locality-shape]", 
        `<p>
        A locality shape defines how to determine the locality and location of a feature
        based on its occurences.</p>

        <p>
        The square locality shape defines the locality of a feature 
        as a box (hypercube) that contains <i>strictly all</i> occurrences
        of the feature, i.e., it does not allow outliers.
        The Gaussian option defines locality similarly with a box
        but allows outliers.</p>

        <p>For these options, the location simply corresponds 
        to the center of the locality boxes. In short,
        the locality is the area that contains all or most occurrences of
        the feature, whereas the location is a point that 
        represents the area.
        </p>
        `
    )

    // Local area size threshold
    area_threshold.on("mousedown", function () {
            d3.selectAll(".localitySizer").remove();
            d3.selectAll(".scatter")
                .append("rect")
                .attr("class", "localitySizer")
                .attr("visibility", "hidden")
                .attr("stroke", "red")
                .attr("stroke-width", 1)
                .attr("fill", "rgba(255, 0, 0, 0.2)")
                .attr("x", width / 2)
                .attr("y", height / 2);
        })
        .on("mouseup", function () {
            d3.selectAll(".localitySizer").remove();
        })
        .on("change", updateBothLocalWordViews)
        .on("input", function () {
            const localitySize = $(this).val();
            d3.selectAll(".localitySizer")
                .attr("visibility", "visible")
                .attr("width", localitySize)
                .attr("height", localitySize)
                .attr("r", localitySize)
                .attr("x", width / 2 - localitySize / 2)
                .attr("y", height / 2 - localitySize / 2);
            updateBothLocalWordViews(true)
        });
    addTooltip(
        "label[for=localAreaThreshold]",
        `<p>How localized (as opposed to spread-out) should each
         feature be to be shown?</p>
        
         <p>The red box that appears on the map as you move the
          slider indicates the current locality size. 
          All or most occurrences (depending on "Locality shape")
          of each visualized feature will be 
          contained in a box of this size.
          </p>
        `
    )
    $("#invert").change(updateBothLocalWordViews);
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
    freq_threshold.change(updateBothLocalWordViews);
    addTooltip(
        "label[for=freqThreshold]",
        `How prominent (frequent in the datapoints) should each feature be to be shown?`
    );
    addTooltip(
        "label[for=freqThreshold-concept]",
        `Concepts are extracted not directly from the datapoints,
        but by first identifying local words from the datapoints
        and then recursively identifying localized commonsense conceptual
        knowledge from the resulting local words.
        
        "Frequency thresholds" applies to the first step, 
        whereas this option applies to the second step.
        `
    );


    freq_threshold_concept.change(updateBothLocalWordViews);


    // Dimension reduction method
    dim_reduction_option.change(function () {
        const dim_reduction_attr = $(
            'input[name="dim-reduction"]:checked'
        ).val(); // TO REFACTOR: use const and let instead of let or vice versa consistently
        dim_reduction = dim_reduction_attr;
        map.switchDimReduction(dim_reduction);
        map1.switchDimReduction(dim_reduction);
        updateBothLocalWordViews();
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
        const d = d3.selectAll(".scatter").select(".selected-dp").data();
        if (d.length > 0) {
            const filter = filterByDatapointAndUpdate(d[0], dataset.data);
            dataset.addFilter(filter);
            if (dataset1) dataset1.addFilter(filter);
        }
    });

    // Show errors only?
    is_to_show_errors_only.on("change", function() {
        if ($("#show-errors").is(":checked")) {
            const filter = new Filter("Errors", "", dataset.errors_idxs);
            dataset.addFilter(filter);
            if (dataset1) dataset1.addFilter(filter);
        } else {
            dataset.removeFilter("Errors");
            if (dataset1) dataset1.removeFilter("Errors");
        }
    });

    // Show confidence?
    show_confidence.on("change", function () {
        if ($("#show-confidence").is(":checked")) {
            map.switchToConfidenceHeatmap();
            if (map1) map1.switchToConfidenceHeatmap();
        } else {
            map.switchToClusterBasedColoring();
            if (map1) map1.switchToClusterBasedColoring();
        }
    });

    // Add a confidence range filter
    confidence_range.change(() => {
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
            if (dataset1) dataset1.addFilter(filter);
        }
    });

    // Show local words?
    is_to_show_errors_only.change(updateBothLocalWordViews);

    // Filter input
    search_input.on("input", function (e) {
        const search_value = e.target.value;
        if (search_value == "") {
            dataset.removeFilter("Search")
            if (dataset1) dataset1.removeFilter("Search");
        } else {
            const search_phrases = search_value.split(";");
            const filter = filterBySearch(dataset.data, search_phrases);
            dataset.addFilter(filter);
            if (dataset1) dataset1.addFilter(filter);
        }
    });

    // Clear button
    clear_btn.on("click", function (e) {
        resetFilterControls();
        dataset.clearFilters();
        if (dataset1) dataset1.clearFilters();
    });

    // Controls on label & cluster widget
    label_filter.unbind("click");

    $(document).bind("keyup", function(e) {
        if (e.key == "Escape") {
            filter_view.undoLastFilter();
            if (filter_view1) filter_view1.undoLastFilter();
        }
    });
}

function initializeModal() {
    const expandModal = document.getElementById('expandModal');
    if (expandModal) {
        const modalTitle = expandModal.querySelector('.modal-title');
        const modalBody = expandModal.querySelector('.modal-body');

        const modal_importance_view = new ImportanceView("importance_chart_in_modal", 18, 12);
        const modal_relation_chart = new Token2SimilarityRelationView("rel-chart-container-in-modal", 18);
        const modal_token_chart = new Token2TokenRelationView("token-chart-container-in-modal", 18);
        
        expandModal.addEventListener('show.bs.modal', (event) => {
            const button = event.relatedTarget;
            const orig_view_id = button.getAttribute('data-bs-orig-view-id');
            const modal_title = button.getAttribute('data-bs-modal-title');
            modalTitle.innerHTML = `${modal_title}`;

            // adjust the height of the scrollable content based on number of tokens 
            const size_m_threshold = 10
            const size_l_threshold = 30;
            const orig_view = d3.select(`#${orig_view_id}`);
            const left_chart_container_selector =  `#${orig_view_id} .rel_chart_left`;
            const right_chart_container_selector =  `#${orig_view_id} .rel_chart_right`;

            const data_orig = orig_view.data()[0];
            const data_left = d3.select(left_chart_container_selector).data()[0];
            const data_right = d3.select(right_chart_container_selector).data()[0];

            let max_length = 0;

            if (data_orig) {
                max_length = data_orig.labels.length;
            } else if (data_left) {
                const texts = [data_left.tokens1, data_left.tokens2, data_right.tokens1, data_right.tokens2]
                const lengths = texts.map(text_tokens => text_tokens.length);
                max_length = Math.max(...lengths);
            }

            modalBody.innerHTML = `<div class="container-in-modal"></div>`;
            const container = $(".container-in-modal");
            if (max_length > size_l_threshold) {
                container.attr("class", "container-in-modal container-l");
            } else if (max_length > size_m_threshold) {
                container.attr("class", "container-in-modal container-m");
            } else {
                container.attr("class", "container-in-modal container-s");
            }
        });

        expandModal.addEventListener('shown.bs.modal', event => {
            const button = event.relatedTarget;
            const view_type = button.getAttribute('data-bs-related-view-type');
            const orig_view_id = button.getAttribute('data-bs-orig-view-id');
            const orig_view = d3.select(`#${orig_view_id}`);

            if (view_type == "importance-chart") {
                const data = orig_view.data()[0];
                $(".container-in-modal").attr("id", "importance-chart-container-in-modal");
                $(".container-in-modal").html(`<canvas id="importance_chart_in_modal"></canvas>`);
                modal_importance_view.update(data);
            } else if (view_type == "rel-chart") {
                const left_chart_container_selector =  `#${orig_view_id} .rel_chart_left`;
                const right_chart_container_selector =  `#${orig_view_id} .rel_chart_right`;

                const data_left = d3.select(left_chart_container_selector).data()[0];
                const data_right = d3.select(right_chart_container_selector).data()[0];

                $(".container-in-modal").attr("id", "rel-chart-container-in-modal");
                modal_relation_chart.update(data_right, data_left);
            } else if (view_type == "token-chart") {
                const left_chart_container_selector =  `#${orig_view_id} .rel_chart_left`;
                const right_chart_container_selector =  `#${orig_view_id} .rel_chart_right`;

                const data_left = d3.select(left_chart_container_selector).data()[0];
                const data_right = d3.select(right_chart_container_selector).data()[0];

                $(".container-in-modal").attr("id", "token-chart-container-in-modal");
                modal_token_chart.update(data_right, data_left);
            }
        })
    }
}

function resetFilterControls() {
    $("#filter").val("");
    $("#show-errors").prop("checked", false);
    $("input.confThreshold[data-index=0]").val(0);
    $("input.confThreshold[data-index=1]").val(100);
}


alert("This demo is optimized for a 16:9 high resolution screen. Please zoom out to fit to your screen.")