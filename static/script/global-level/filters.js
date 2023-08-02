let currentHulls = null;


function filterByIntents(data, intents, bbox) {
    const dp_idxs = data
        .filter((d) => intents.includes(d.ground_truth))
        .map((d) => d.idx);
    // filterChart(dp_idxs);
    // let [visibles, gold_intent_set, predicted_intent_set] =
    //     getVisibleDatapoints(width, height);
    // filterHulls(gold_intent_set);
    return dp_idxs;
}


function filterByConfidence(data, 
                            conf_threshold_lower, 
                            conf_threshold_upper) {
    const filter_idxs = data
        .filter(function (d) {
            const confidence = calculateConfidence(d) * 100;
            return (
                conf_threshold_lower < confidence &&
                confidence < conf_threshold_upper
            );
        })
        .map((d) => d.idx);
    // if (filter_idxs.length == 0) {
    //     filterChart([-1]);
    // } else {
    //     filterChart(filter_idxs);
    // }
    return filter_idxs;
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
    return idxs;
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


export { 
    filterByIntents, 
    filterByConfidence,
    filterByDatapoint,
    getVisibleDatapoints, 
    calculateConfidence 
}