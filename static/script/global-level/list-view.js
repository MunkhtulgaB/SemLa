class ListView {

    #observables = [];

    update() {
        this.updateConceptsList();
        this.updateWordsList();
        this.updateGoldLabelList();
        this.updatePredictedLabelList();
    }

    renderContrastiveBarChart(entries, container) {
        const maxValue = 1; // Math.max(...local_words_set.map(x => Math.abs(x.groupProb)));
        entries.forEach(element => {
            const relative_prob = (maxValue == 0) ? 0 : Math.abs(element.groupProb) / Math.abs(maxValue);
            let offset;
            let width;
            let color;
            if (element.groupProb < 0) {
                offset = 50 -  50 * relative_prob;
                width = 50 * relative_prob;
                color = "blue";
            } else {
                offset = 50;
                width = 50 * relative_prob;
                color = "orange";
            }
            
            container.append(
                `<div value="${element.word}" 
                        style="margin-top: 5px; display: flex; flex-direction: column; align-items: center">                          
                    <svg class="chart" width="70%" height="10px" style="overflow: visible; border: 1px solid lightgrey;">
                        <text font-size="0.8em" x="-32" y="10" fill="grey">${this.formatPercentage(element.prob * 100)}%</text>
                        <text font-size="0.8em" x="103%" y="10" fill="grey">${this.formatPercentage(element.prob1 * 100)}%</text>
                        <g class="contrastiveness-bar" 
                            style="transform: translate(${offset.toFixed(0)}%, 0);">
                            <rect width="${width}%" height="100%" fill="${color}"></rect>
                        </g>
                    </svg>
                    <div style="text-align: center; font-weight: bold">
                        ${element.word}
                    </div>
                </div>`);
        });
    }

    updateConceptsList() {
        const concepts = this.#observables[0].local_concepts;
        const concepts1 = (this.#observables[1]) ? this.#observables[1].local_concepts : [];
 
        const local_concepts_set = this.getWordSetWithContrastiveProb(concepts, concepts1);
        const conceptsList = $("#current-list-concept");

        conceptsList.empty();

        this.renderContrastiveBarChart(
            local_concepts_set
                .sort(this.sortByContrastiveness),
            conceptsList
        )
    }

    updateWordsList() {
        const words = this.#observables[0].local_words;
        const words1 = (this.#observables[1]) ? this.#observables[1].local_words : [];

        const local_words_set = this.getWordSetWithContrastiveProb(words, words1);
        const wordsList = $("#current-list-word");
        
        wordsList.empty();
        this.renderContrastiveBarChart(
                local_words_set
                    .sort(this.sortByContrastiveness),
                wordsList
            );
    }

    updateGoldLabelList() {
        let labels = this.#observables[0].goldLabels;
        let labels1 = (this.#observables[1]) ? this.#observables[1].goldLabels : [];

        if (labels && labels1) {
            const total_length = labels.length;
            const total_length1 = labels1.length;
            
            labels = this.getLabelSetSortedByCount(labels);
            labels1 = this.getLabelSetSortedByCount(labels1);
            const labelSet = this.getLabelSetWithContrastiveProb(
                                            labels, 
                                            labels1,
                                            total_length,
                                            total_length1);
            const wordsList = $("#current-list-gold-label");
            wordsList.empty();
            this.renderContrastiveBarChart(
                labelSet
                    .sort(this.sortByContrastiveness),
                wordsList
            )
        }
    }

    updatePredictedLabelList() {
        let labels = this.#observables[0].predictedLabels;
        let labels1 = (this.#observables[1]) ? this.#observables[1].predictedLabels : [];

        if (labels && labels1) {

            const total_length = labels.length;
            const total_length1 = labels1.length;
            
            labels = this.getLabelSetSortedByCount(labels);
            labels1 = this.getLabelSetSortedByCount(labels1);
            const labelSet = this.getLabelSetWithContrastiveProb(
                                                labels, 
                                                labels1,
                                                total_length,
                                                total_length1);          
            const wordsList = $("#current-list-predicted-label");
            wordsList.empty();
            this.renderContrastiveBarChart(
                labelSet
                .sort(this.sortByContrastiveness),
                wordsList
            )
        }        
    }

    

    sortByContrastiveness(a, b) {
        return (a.groupProb - b.groupProb) ||
                b.prob - a.prob;
    }

    formatPercentage(num) {
        if (num >= 100) {
            return num.toFixed(0);
        } else {
            return num.toFixed(1);
        } 
    }

    getLabelSetSortedByCount(labelList) {
        const counts = {} 
        labelList.forEach(element => {
            if (!counts[element]) {
                counts[element] = 1;
            } else {
                counts[element] += 1;
            }
        });

        const labels = Object.entries(counts);
        labels.sort((a,b) => b[1] - a[1])
        return labels;
    }

    getWordSetWithContrastiveProb(wordsList,
                                  wordsList1) {
        const wordSet = {}
        wordsList.forEach(word => {
            if (!wordSet[word.word]) {
                wordSet[word.word] = {
                    word: word.word,
                    groupProb: -word.prob,
                    prob: word.prob,
                    prob1: 0
                };
            } else {
                wordSet[word.word].groupProb -= word.prob;
                wordSet[word.word].prob = word.prob;
            }
        });

        wordsList1.forEach(word => {
            if (!wordSet[word.word]) {
                wordSet[word.word] = {
                    word: word.word,
                    groupProb: word.prob,
                    prob: 0,
                    prob1: word.prob,
                };
            } else {
                wordSet[word.word].groupProb += word.prob;
                wordSet[word.word].prob1 = word.prob;
            }
        });

        return Object.values(wordSet);
    }

    getLabelSetWithContrastiveProb(labelList, 
                                    labelList1,
                                    total_length,
                                    total_length1) {
        const labelSet = {}
        labelList.forEach(([label, count]) => {
            const prob = count / total_length;
            if (!labelSet[label]) {
                labelSet[label] = {
                    word: label,
                    groupProb: -prob,
                    prob: prob,
                    prob1: 0
                };
            } else {
                labelSet[label].groupRob -= prob;
                labelSet[label].prob = prob;
            }
        });

        labelList1.forEach(([label, count]) => {
            const prob1 = count / total_length1;
            if (!labelSet[label]) {
                labelSet[label] = {
                    word: label,
                    groupProb: prob1,
                    prob: 0,
                    prob1: prob1
                };
            } else {
                labelSet[label].groupProb += prob1;
                labelSet[label].prob1 = prob1;
            }
        });

        return Object.values(labelSet);
    }

    observe(observable) {
        observable.addObserver(this);
        this.#observables.push(observable);
    }

    get observables() {
        return this.#observables;
    }
    

}


export {
    ListView
}