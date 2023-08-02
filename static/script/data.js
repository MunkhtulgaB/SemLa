class Filter {

    #type;
    #value;
    #idxs;
    
    constructor(type, value, idxs) {
        this.#type = type;
        this.#value = value;
        this.#idxs = idxs;
    }

    get type() {
        return this.#type;
    }

    get value() {
        return this.#value;
    }

    get idxs() {
        return this.#idxs;
    }

}


class Dataset {

    #data;
    #corrects;
    #errors;
    #confusions;
    #cluster_to_intent;
    #intent_to_cluster;
    #gt_counts;
    #pred_counts;
    #filteredData;
    #observers = [];
    #filters = {};

    constructor(data) {
        this.#data = data;
        this.#filteredData = data;
        this.initIntentClusterMaps(data);
        this.initErrorAndConfusionLists(data);
    }

    initIntentClusterMaps(data) {
        const cluster_to_intent = {};
        const intent_to_cluster = {};

        data.forEach(function (d) {
            if (!cluster_to_intent[d.intent_cluster]) {
                cluster_to_intent[d.intent_cluster] = new Set([d.ground_truth]);
            } else {
                cluster_to_intent[d.intent_cluster].add(d.ground_truth);
            }

            if (!intent_to_cluster[d.prediction]) {
                intent_to_cluster[d.prediction] = d.intent_cluster;
            }
        });

        this.#cluster_to_intent = cluster_to_intent;
        this.#intent_to_cluster = intent_to_cluster;
    }

    initErrorAndConfusionLists(data) {
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

        this.#corrects = corrects;
        this.#errors = errors;
        this.#confusions = confusions;
        this.#gt_counts = gt_counts;
        this.#pred_counts = pred_counts;
    }

    addFilter(newFilter) {
        if (!this.#filters[newFilter.type]) {
            this.#filters[newFilter.type] = newFilter;
            this.#filteredData = this.#filteredData.filter((d) => {
                return newFilter.idxs.includes(d.idx);
            });
        } else {
            this.#filters[newFilter.type] = newFilter;
            this.#filteredData = this.refilterData();
        }
        this.notifyObservers(newFilter.type);
    }

    refilterData() {
        const filters = Object.values(this.#filters);
        const idxs = filters.map(filter => filter.idxs);
        console.log(filters.map(filter => filter.type))
        let idxs_intersection = idxs[0];
        const other_idxs = idxs.slice(1,);
        
        other_idxs.forEach((other_idxs) => {
            idxs_intersection = idxs_intersection.filter((idx) =>
                other_idxs.includes(idx)
            )
        });
        return this.#data.filter((d) => idxs_intersection.includes(d.idx));
    }

    clearFilters() {
        this.#filters = {};
        this.#filteredData = this.#data;
        this.notifyObservers("clear");
    }

    notifyObservers(msg) {
        this.#observers.forEach((observer) => 
                            observer.update(this.filteredData, msg));
    }

    addObserver(observer) {
        this.#observers.push(observer);
    } 

    get filteredData() {
        return this.#filteredData;
    }  

    get data() {
        return this.#data;
    }

    get corrects() {
        return this.#corrects;
    }

    get errors() {
        return this.#errors;
    }

    get confusions() {
        return this.#confusions;
    }

    get gtCounts() {
        return this.#gt_counts;
    }

    get predCounts() {
        return this.#pred_counts;
    }

    get clusterToIntent() {
        return this.#cluster_to_intent;
    }

    get intentToCluster() {
        return this.#intent_to_cluster;
    }
}


export { Filter, Dataset }