class FilterView {

    #dataset;

    constructor(dataset) {
        this.#dataset = dataset;
        dataset.addObserver(this);
    }

    update(_, msg) {
        
        const filterView = $("#current-filters");
        if (msg == "clear") {
            filterView.html("")
        } else {
            const currentFilters = msg;
            let html = "";
            for (const [type, filter] of Object.entries(currentFilters)) {
                html += `<span class="p-1 m-1 badge text-bg-primary">${type} ${filter.value}</span>`;
            }
            filterView.html(html);
        }
    }

}


function filterBySubstring(data, search_phrases) {
    const filter_idxs = data
        .filter(function (d) {
            return search_phrases.every(function (phrase) {
                return d.text.includes(phrase);
            });
        })
        .map((d) => d.idx);
    return filter_idxs;
}


function filterByIntents(data, intents, byGoldLabel) {
    const dp_idxs = data
        .filter((d) => intents.includes((byGoldLabel) ?
                                            d.ground_truth
                                            : d.prediction))
        .map((d) => d.idx);
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


function getVisibleDatapoints(width, height, mapViewId) {
    let gold_intents = [];
    let predicted_intents = [];

    const visibles = d3.selectAll(`#${mapViewId} .datapoint`).filter(function (d) {
        let x = this.transform.baseVal[0].matrix.e;
        let y = this.transform.baseVal[0].matrix.f;

        let is_visible = d3.select(this).style("visibility") == "visible";
        is_visible = is_visible && 0 < x && x < width && 0 < y && y < height;
        if (is_visible) {
            gold_intents.push(d["ground_truth"]);
            predicted_intents.push(d["prediction"]);
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
    calculateConfidence,
    filterBySubstring,
    FilterView
}