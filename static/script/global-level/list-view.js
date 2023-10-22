class ListView {

    #dataset;

    constructor(dataset) {
        this.#dataset = dataset;
        dataset.addObserver(this);
    }

    update(_, msg) {
        console.log("Updating list view");
    }

    get dataset() {
        return this.#dataset;
    }

}




export {
    ListView
}