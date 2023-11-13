class Filter {

    #type;
    #value;
    #idxs;
    #isImportant;
    
    constructor(type, value, idxs, isImportant) {
        this.#type = type;
        this.#value = value;
        this.#idxs = idxs;
        this.#isImportant = isImportant;
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

    get isImportant() {
        return this.#isImportant;
    }

}


class Dataset {

    #data;
    #corrects;
    #errors;
    #errors_idxs
    #confusions;
    #cluster_to_label;
    #label_to_cluster;
    #gt_counts;
    #pred_counts;
    #filteredData;
    #observers = [];
    #filters = {};

    constructor(data) {
        this.#data = data;
        this.#filteredData = data;
        this.initLabelClusterMaps(data);
        this.initErrorAndConfusionLists(data);
    }

    initLabelClusterMaps(data) {
        const cluster_to_label = {};
        const label_to_cluster = {};

        data.forEach(function (d) {
            const label_cluster = (d.label_cluster != undefined)? d.label_cluster : d.intent_cluster;
        
            if (!cluster_to_label[label_cluster]) {
                cluster_to_label[label_cluster] = new Set([d.prediction]);
            } else {
                cluster_to_label[label_cluster].add(d.prediction);
            }

            if (!label_to_cluster[d.prediction]) {
                label_to_cluster[d.prediction] = label_cluster;
            }
        });

        this.#cluster_to_label = cluster_to_label;
        this.#label_to_cluster = label_to_cluster;
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
                    gt_counts[dp.ground_truth] = 1;
                }

                if (dp.prediction in pred_counts) {
                    pred_counts[dp.prediction] += 1;
                } else {
                    pred_counts[dp.prediction] = 1;
                }
            } else if (dp["ground_truth_label_idx"] == dp["prediction_label_idx"]) {
                corrects.push(dp);
            }
        });

        this.#corrects = corrects;
        this.#errors = errors;
        this.#errors_idxs = errors_idxs;
        this.#confusions = confusions;
        this.#gt_counts = gt_counts;
        this.#pred_counts = pred_counts;
    }

    addFilter(newFilter, doNotUpdateLocalWords, observerId) {
        if (!this.#filters[newFilter.type]) {
            this.#filters[newFilter.type] = newFilter;
            if (newFilter.idxs) {
                this.#filteredData = this.#filteredData.filter((d) => {
                    return newFilter.idxs.includes(d.idx);
                });

                if (newFilter.isImportant) {
                    const must_have_data = this.#data.filter(d => 
                        newFilter.idxs.includes(d.idx));
                    
                    this.#filteredData = Array.from(
                        new Set(this.#filteredData
                                .concat(must_have_data))
                    );
                }
            }
        } else {
            this.#filters[newFilter.type] = newFilter;
            if (newFilter.idxs) {
                this.#filteredData = this.refilterData();
            }
        }
        this.notifyObservers(this.#filters, doNotUpdateLocalWords, observerId);
    }

    removeFilter(filterType) {
        delete this.#filters[filterType];
        this.#filteredData = this.refilterData();
        this.notifyObservers(this.#filters);
    }

    refilterData() {
        const filters = Object.values(this.#filters);
        if (filters.length == 0) return this.#data;
        let idxs_intersection = filters[0].idxs;
        const other_filters = filters.slice(1,);
        
        other_filters.forEach((other_filter) => {
            idxs_intersection = idxs_intersection.filter((idx) =>
                other_filter.idxs.includes(idx)
            )
        });

        // if there are any important filters,
        // add their idxs in any case
        filters.filter(x => x.isImportant).forEach((filter) => {
            idxs_intersection = Array.from(
                new Set(idxs_intersection
                            .concat(filter.idxs)
                        )
            );
        })

        return this.#data.filter((d) => idxs_intersection.includes(d.idx));
    }

    clearFilters() {
        this.#filters = {};
        this.#filteredData = this.#data;
        this.notifyObservers("clear");
    }

    notifyObservers(msg, doNotUpdateLocalWords, observerId) {
        this.#observers.forEach((observer) => 
            observer.update(this.filteredData.map(d => d.idx), 
                            msg,
                            doNotUpdateLocalWords,
                            observerId));
    }

    addObserver(observer) {
        this.#observers.push(observer);
    } 

    get filters() {
        return this.#filters;
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

    get errors_idxs() {
        return this.#errors_idxs;
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

    get clusterToLabel() {
        return this.#cluster_to_label;
    }

    get labelToCluster() {
        return this.#label_to_cluster;
    }
}


export { Filter, Dataset }