class FilterView {

    #dataset;
    #onRemove;
    #container_id;

    constructor(container_id, dataset, onRemove) {
        this.#dataset = dataset;
        this.#onRemove = onRemove;
        this.#container_id = container_id;
        if (dataset) dataset.addObserver(this);
    }

    update(_, msg) {
        const filterView = $(`#${this.#container_id}`);
        if (msg == "clear") {
            filterView.html("")
        } else {
            const currentFilters = msg;
            let html = "";
            for (const [type, filter] of Object.entries(currentFilters)) {
                html += `<span class="p-1 m-1 badge text-bg-secondary">
                            ${type} ${filter.value}
                            <span data="${type}" class="filter-remove-btn" style="background-color: transparent;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="white" class="bi bi-trash" viewBox="0 0 16 16">
                                    <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5Zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6Z"/>
                                    <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1ZM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118ZM2.5 3h11V2h-11v1Z"/>
                                </svg>
                            </span>
                        </span>`;
            }
            filterView.html(html);
        }

        $(".filter-remove-btn").unbind("click")
        $(".filter-remove-btn").click(this.#onRemove);
    }

    setOnRemove(removeFunction) {
        this.#onRemove = removeFunction;
    }

    undoLastFilter() {
        const filterTypes = Object.keys(this.#dataset.filters);
        const lastFilterType = filterTypes.pop();
        this.undoFilter(lastFilterType);
    }

    undoFilter(filterType) {
        this.#dataset.removeFilter(filterType);
        this.resetFilterControl(filterType);
    }

    resetFilterControl(filterType) {
        if (filterType == "Search") {
            $("#filter").val("");
        } else if (filterType == "Errors") {
            $("#show-errors").prop("checked", false);
        } else if (filterType == "Confidence") {
            $("input.confThreshold[data-index=0]").val(0);
            $("input.confThreshold[data-index=1]").val(100);
        } else if (filterType == "Intent") {
            d3.selectAll("path.labelHull").attr("visibility", "hidden");
            d3.selectAll(".group-type-legend").style("display", "none");
        }
    }

    get dataset() {
        return this.#dataset;
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

    return [
        visibles,
        gold_intents,
        predicted_intents,
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