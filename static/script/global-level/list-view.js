class ListView {

    #observable;

    constructor(observable, ) {
        this.#observable = observable;
        observable.addObserver(this);
    }

    update(_, msg) {
        this.updateConceptsList();
        this.updateWordsList();
        this.updateGoldLabelList();
        this.updatePredictedLabelList();

    }

    updateConceptsList() {
        const local_concepts = this.observable.local_concepts;
        const conceptsList = $("#current-list-concept");

        conceptsList.empty();
        local_concepts.forEach(element => {
            conceptsList.append(
                `<option value="${element.word}" 
                        style="background-color: lightgrey">
                        ${element.word}
                </option>`);
        });
    }

    updateWordsList() {
        const local_words = this.observable.local_words;
        const wordsList = $("#current-list-word");

        wordsList.empty();
        local_words.forEach(element => {
            wordsList.append(
                `<option value="${element.word}" 
                        style="background-color: lightgrey">
                        ${element.word}
                </option>`);
        });
    }

    updateGoldLabelList() {
        const local_words = this.observable.goldLabels;
        const wordsList = $("#current-list-gold-label");
        
        wordsList.empty();
        local_words.forEach(element => {
            wordsList.append(
                `<option value="${element}" 
                        style="background-color: lightgrey">
                        ${element}
                </option>`);
        });
    }

    updatePredictedLabelList() {
        const local_words = this.observable.predictedLabels;
        const wordsList = $("#current-list-predicted-label");

        wordsList.empty();
        local_words.forEach(element => {
            wordsList.append(
                `<option value="${element}" 
                        style="background-color: lightgrey">
                        ${element}
                </option>`);
        });
    }

    get observable() {
        return this.#observable;
    }

}


export {
    ListView
}