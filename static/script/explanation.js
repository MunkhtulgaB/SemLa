class ExplanationSet {

    #dataset_name;
    #importances;
    #token2token_relations;
    #token2similarity_relations;

    constructor(dataset_name) {
        this.#dataset_name = dataset_name;

        this.initializeExplanationData();
    }

    initializeExplanationData() {
        this.loadImportances();
        this.loadToken2TokenRelations();
        this.loadToken2SimRelations();
    }

    loadImportances() {
        return new Promise((resolve, reject) => {
            const startTime = new Date();
            $.ajax(`static/data/cached-explanations/${this.#dataset_name}/importances.json`)
                .done(function (res) {
                    this.importances = res;
                    console.log(`Importances loaded (in ${new Date() - startTime}ms)`);
                    resolve();
                }.bind(this))
                .fail(function () {
                    alert("error");
                    reject();
                });
        });
    }

    loadToken2TokenRelations() {
        return new Promise((resolve, reject) => {
            const startTime = new Date();
            $.ajax(`static/data/cached-explanations/${this.#dataset_name}/token2token_relations.json`)
                .done(function (res) {
                    this.token2token_relations = res;
                    console.log(`Token-to-token relations loaded (in ${new Date() - startTime}ms)`);
                    resolve();
                }.bind(this))
                .fail(function () {
                    alert("error");
                    reject();
                });
        });
    }

    loadToken2SimRelations() {
        return new Promise((resolve, reject) => {
            const startTime = new Date();
            $.ajax(`static/data/cached-explanations/${this.#dataset_name}/token2similarity_relations.json`)
                .done(function (res) {
                    this.token2similarity_relations = res;
                    console.log(`Token-to-similarity relations loaded (in ${new Date() - startTime}ms)`);
                    resolve();
                }.bind(this))
                .fail(function () {
                    alert("error");
                    reject();
                });
        });
    }

    get importances() {
        return this.#importances;
    }

    get token2token_relations() {
        return this.#token2token_relations;
    }

    get token2similarity_relations() {
        return this.#token2similarity_relations;
    }

    set importances(importances) {
        this.#importances = importances;
    }

    set token2token_relations(token2token_relations) {
        this.#token2token_relations = token2token_relations;
    }

    set token2similarity_relations(token2similarity_relations) {
        this.#token2similarity_relations = token2similarity_relations;
    }
}


export { ExplanationSet }