class ListView {

    #observables = [];

    update() {
        this.updateConceptsList();
        this.updateWordsList();
        this.updateGoldLabelList();
        this.updatePredictedLabelList();
    }

    updateConceptsList() {
        const concepts = this.assignGroup(this.#observables[0].local_concepts, -1);
        const concepts1 = this.assignGroup(this.#observables[1].local_concepts, 1);
        const local_concepts = concepts.concat(concepts1);
        
        const local_concepts_set = this.getWordSetWithContrastiveProb(local_concepts);
        const conceptsList = $("#current-list-concept");

        conceptsList.empty();
        local_concepts_set
            .sort((a,b) => a.groupProb - b.groupProb)
            .forEach(element => {
            conceptsList.append(
                `<option value="${element.word}" 
                        style="background-color: lightgrey">
                        ${element.word}
                        ${element.groupProb}
                </option>`);
        });
    }

    updateWordsList() {
        const words = this.assignGroup(this.#observables[0].local_words, -1);
        const words1 = this.assignGroup(this.#observables[1].local_words, 1);
        const local_words = words.concat(words1);

        const local_words_set = this.getWordSetWithContrastiveProb(local_words);
        const wordsList = $("#current-list-word");
        
        wordsList.empty();
        local_words_set
            .sort((a,b) => a.groupProb - b.groupProb)
            .forEach(element => {
                wordsList.append(
                    `<option value="${element.word}" 
                            style="background-color: lightgrey">
                            ${element.word}
                            ${element.groupProb}
                    </option>`);
            });
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
            labelSet
                .sort((a,b) => a[1] - b[1])
                .forEach(([label, count]) => {
                wordsList.append(
                    `<option value="${label}" 
                            style="background-color: lightgrey">
                            ${label}
                            ${count}
                    </option>`);
            })
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
            labelSet
                .sort((a,b) => a[1] - b[1])
                .forEach(([label, count]) => {
                wordsList.append(
                    `<option value="${label}" 
                            style="background-color: lightgrey">
                            ${label}
                            ${count}
                    </option>`);
            });
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

        return Object.entries(labelSet);
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