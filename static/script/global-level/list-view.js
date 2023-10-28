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
                color = "red";
            }
            
            container.append(
                `<div value="${element.word}" 
                        style="display: flex-column">                          
                    <svg class="chart" width="100%" height="10px" style="border: 1px solid lightgrey;">
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
        const concepts = this.assignGroup(this.#observables[0].local_concepts, -1);
        const concepts1 = this.assignGroup(this.#observables[1].local_concepts, 1);
        const local_concepts = concepts.concat(concepts1);
        
        const local_concepts_set = this.getWordSetWithContrastiveProb(local_concepts);
        const conceptsList = $("#current-list-concept");

        conceptsList.empty();

        this.renderContrastiveBarChart(
            local_concepts_set
                .sort((a,b) => a.groupProb - b.groupProb),
            conceptsList
        )
    }

    updateWordsList() {
        const words = this.assignGroup(this.#observables[0].local_words, -1);
        const words1 = this.assignGroup(this.#observables[1].local_words, 1);
        const local_words = words.concat(words1);

        const local_words_set = this.getWordSetWithContrastiveProb(local_words);
        const wordsList = $("#current-list-word");
        
        wordsList.empty();
        this.renderContrastiveBarChart(
                local_words_set
                    .sort((a,b) => a.groupProb - b.groupProb),
                wordsList
            );
    }

    updateGoldLabelList() {
        let labels = this.#observables[0].goldLabels;
        let labels1 = this.#observables[1].goldLabels;

        if (labels && labels1 && labels.length > 0 
                    && labels1.length > 0) {
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
                    .sort((a,b) => a.groupProb - b.groupProb),
                wordsList
            )
        }
    }

    updatePredictedLabelList() {
        let labels = this.#observables[0].predictedLabels;
        let labels1 = this.#observables[1].predictedLabels;

        if (labels && labels1 && labels.length > 0 
            && labels1.length > 0) {

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
                .sort((a,b) => a.groupProb - b.groupProb),
                wordsList
            )
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

    assignGroup(words, groupId) {
        return words.map(
            word => {
                return Object.assign(
                    word, 
                    {group: groupId,
                    groupProb: groupId * word.prob});
            }
        )
    }

    getWordSetWithContrastiveProb(wordsList) {
        const wordSet = {}
        wordsList.forEach(word => {
            if (!wordSet[word.word]) {
                wordSet[word.word] = word;
            } else {
                wordSet[word.word].groupProb += word.groupProb;
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
            if (!labelSet[label]) {
                labelSet[label] = -count / total_length;
            } else {
                labelSet[label] -= count / total_length;
            }
        });

        labelList1.forEach(([label, count]) => {
            if (!labelSet[label]) {
                labelSet[label] = count / total_length1;
            } else {
                labelSet[label] += count / total_length1;
            }
        });

        return Object.entries(labelSet)
            .map(([label, prob]) => 
                ({word: label, groupProb: prob})
            );
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