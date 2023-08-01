// filters





let currentHulls = null;

function filterHulls(intents) {
    currentHulls = intents;

    d3.selectAll("path.intentHull").attr("visibility", function (d) {
        let [intent, pts] = d;
        intent = parseInt(intent);
        if (intents.includes(intent)) {
            return "visible";
        } else {
            return "hidden";
        }
    });
}


function filterByIntents(data, intents, bbox) {
    const width = bbox.width;
    const height = bbox.height;
    if (intents.length < 1) {
        clear();
    } else {
        const dp_idxs = data
            .filter((d) => intents.includes(d.ground_truth))
            .map((d) => d.idx);
        filterChart(dp_idxs);
        let [visibles, gold_intent_set, predicted_intent_set] =
            getVisibleDatapoints(width, height);
        filterHulls(gold_intent_set);
    }
}


function filterByConfidence(data) {
    const conf_threshold_lower =
        parseInt($("input.confThreshold[data-index=0]").val()) || 0;
    const conf_threshold_upper =
        parseInt($("input.confThreshold[data-index=1]").val()) || 100;

    let starting_list;
    if ($("#show-errors").is(":checked")) {
        starting_list = data.filter((d) => errors_idxs.includes(d.idx));
    } else {
        starting_list = data;
    }

    const filter_idxs = starting_list
        .filter(function (d) {
            const confidence = calculateConfidence(d) * 100;
            return (
                conf_threshold_lower < confidence &&
                confidence < conf_threshold_upper
            );
        })
        .map((d) => d.idx);
    if (filter_idxs.length == 0) {
        filterChart([-1]);
    } else {
        filterChart(filter_idxs);
    }
}



function filterChart(idxs) {
    d3.selectAll(".datapoint").attr("visibility", function (d) {
        if (idxs.length == 0) return "visible";
        if (idxs.includes(d.idx)) {
            return "visible"; // TO REFACTOR: use semi-colons consistently
        } else {
            return "hidden";
        }
    });

    d3.selectAll(".drag_line").style("visibility", "hidden");
}

function clear(data) {
    $("#filter").val("");

    filterByConfidence(data);
    filterHulls([]);

    $(".selected-dp")
        .attr("stroke", "#9299a1")
        .attr("stroke-width", "1px")
        .removeClass("selected-dp");
}



function filterByDatapoint(d, data, filter_by) {
    if (!d) {
        return;
    }

    
    let idxs = [];
    if (filter_by == "support_set") {
        idxs = d[filter_by].concat([d["idx"]]);
    } else {
        data.forEach(function (dp, i) {
            if (dp[filter_by] == d[filter_by]) {
                idxs.push(i);
            }
        });
    }
    filterChart(idxs);
    filterHulls([]);
}




function calculateConfidence(d) {
    const tau = 15;

    let probs = softmax(d.distances[0].map((dist) => dist / tau));
    probs = probs.sort((a, b) => b - a);
    const confidence = probs[0] - probs[1];
    return confidence;
}


function softmax(values) {
    const val_exps = values.map((val) => Math.exp(val));
    const exps_sum = val_exps.reduce((a, b) => a + b, 0);
    return val_exps.map((val) => val / exps_sum);
}


function getVisibleDatapoints(width, height) {
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


export { clear,
        filterByIntents, 
        filterByConfidence, 
        filterChart,
        filterHulls,
        filterByDatapoint,
        getVisibleDatapoints, 
        calculateConfidence }