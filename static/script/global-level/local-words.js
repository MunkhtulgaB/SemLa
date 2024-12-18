import { getStopwords } from "./stopwords.js";
import { getVisibleDatapoints } from "./filters.js"
import { Filter } from "../data.js"
import { initializeTooltip, showTooltip, moveTooltipsToCursor, hideTooltips } from "./tooltip.js";


const LIMIT_CONCEPTS = 10;
const STOP_WORDS = getStopwords();
const TOOLTIP_ID = "local-word-tooltip";


class LocalWordsView {

    #mapViewId;
    #width;
    #height;
    #dataset;
    #conceptCache;
    #isAlreadyLoading;
    #forceSimulation;

    #goldLabels;
    #predictedLabels;

    #filteredData;
    #observers = [];

    #local_words = [];
    #local_concepts = [];

    constructor(mapViewId, width, height, dataset) {
        this.#mapViewId = mapViewId;
        this.#width = width;
        this.#height = height;
        this.#dataset = dataset;

        this.#conceptCache = {};
        this.isAlreadyLoading = false;
        this.selectedLocalWord;
        initializeTooltip(`${TOOLTIP_ID}`, "super-container");
    }

    setLocalGoldLabels(goldLabels) {
        this.#goldLabels = goldLabels;
    }

    setLocalPredictedLabels(predictedLabels) {
        this.#predictedLabels = predictedLabels;
    }

    update(isHighFrequencyCall) {
        const feature_type = $("#local-feature-type-select").val();
        if (isHighFrequencyCall == true && feature_type == "concept") {
            return;
        }

        const dataset = this.#dataset;

        let onLocalWordClick = function(filter_name, idxs, words, concepts, goldLabels, predictedLabels) {
            const filter = new Filter(filter_name, "", idxs); // dummy filter to update the current filters
            dataset.addFilter(filter, true, this.#mapViewId);
            this.setLocalGoldLabels(goldLabels);
            this.setLocalPredictedLabels(predictedLabels);
            this.setLocalWords(words);
            this.setLocalConcepts(concepts);
            this.notifyObservers(idxs, this.#mapViewId, true);
        };
        let [visibles, gold_labels, predicted_labels] = getVisibleDatapoints(
                                    this.#width, 
                                    this.#height,
                                    this.#mapViewId);
        this.showLocalWords(visibles, 
                isHighFrequencyCall, 
                onLocalWordClick.bind(this)
            )
            .then(([local_words, local_concepts]) => {
                this.setLocalGoldLabels(gold_labels);
                this.setLocalPredictedLabels(predicted_labels);
                this.setLocalConcepts(local_concepts);
                this.setLocalWords(local_words);
                this.notifyObservers(null, this.#mapViewId, true);
            })
            .catch((e) => {
                console.log(e)
            });
    }

    // A function that counts word frequency in all visible dps
    showLocalWords(visibles, isHighFrequencyCall, onClick) {
        return new Promise((resolve, reject) => {
            if (this.#forceSimulation) {
                this.#forceSimulation.stop();
            }
            const is_to_show_local_words = $("#show-local-words").is(":checked");
            const feature_type = $("#local-feature-type-select").val();
            const n_grams = $("#how-many-grams").val();
            
            if (!is_to_show_local_words || !n_grams || n_grams < 1) {
                d3.selectAll(`#${this.#mapViewId}  .local_word`).remove();
                resolve([]);
            }
    
            visibles.each(function (d) {
                d.x = this.transform.baseVal[0].matrix.e;
                d.y = this.transform.baseVal[0].matrix.f;
            });
    
            let localised_words = extractLocalFeatures(
                visibles.data(),
                (feature_type == "concept")? "text":feature_type, // for concepts and words, we need to find the local words first in any case
            );
            
            if (feature_type == "concept") {
                this.showLocalConcepts(localised_words, onClick, visibles.data().length)
                    .then((local_concepts) => resolve([localised_words, local_concepts]));
            } else {
                this.render_local_words(localised_words, isHighFrequencyCall, onClick);
                resolve([localised_words, []]);
            }
        });
    }


    showLocalConcepts(local_words, onClick, total_num_of_visible_dps) {
        return new Promise((resolve, reject) => {
            // characterize each word with various features
            let progress = 0;
            showProgress(0, local_words.length);

            this.loadConceptCache()
                .then(() => {
                    local_words.forEach((word_data) => {
                        
                        this.getConcepts(word_data.word)
                        .then((edges) => {
                            const [concepts, rels] = edges;           
                            word_data["concepts"] = concepts;
                            word_data["rels"] = rels;
                            progress++;

                            // check all words are processed
                            const isComplete = progress == local_words.length;        
                            const magnitudeOrder = orderOfMagnitude(local_words.length);

                            if (progress % Math.pow(10, magnitudeOrder - 1) == 0) {
                                updateProgress(progress, local_words.length);
                            }
        
                            if (isComplete) {
                                hideProgress();
                                // then apply the localization algorithm on those features
                                const localConcepts = extractLocalFeatures(local_words, 
                                                                "concept", 
                                                                total_num_of_visible_dps);
                                this.render_local_words(localConcepts, false, onClick);
                                resolve(localConcepts);
                            }
                        });

                    });
                });
        });
    }

    getConcepts(word) {
        word = word.toLowerCase();
        return new Promise((resolve, reject) => {
            if (!Object.hasOwn(this.#conceptCache, word)) {
                console.log("getting concepts from ConceptNet");
    
                // $.get("https://api.conceptnet.io/related/c/en/"+word.replace(" ", "_")+`?filter=/c/en&limit=${LIMIT_CONCEPTS}`, function(data, status) {   
                $.get("https://api.conceptnet.io/query?node=/c/en/"+word.replace(" ", "_")+`&other=/c/en&limit=${LIMIT_CONCEPTS}`, function(data, status) {
                    const concepts = [];
                    const rels = [];
                    let edges = data.edges
                    .filter((edge) => 
                        edge.start.language == "en" &&
                        edge.end.language == "en");
    
                    // store all unique concept-edge pairs
                    edges.forEach((edge) => {
                        const start = edge.start.label.toLowerCase();
                        const end = edge.end.label.toLowerCase();
                        const rel = edge.rel.label;
    
                        let concept;
        
                        if (start == word || start.split(" ").includes(word)) {
                            concept = end;
                        } else if (end == word || end.split(" ").includes(word)) {
                            concept = start;
                        }
                        
                        if (!concepts.includes(concept)) {
                            concepts.push(concept);
                            rels.push(rel);
                        }
                    });
    
                    this.#conceptCache[word] = [concepts, rels];
                    resolve(this.#conceptCache[word]);
                }.bind(this)).fail(function(e) {
                    if ([0, 429].includes(e.status)) {
                        updateProgressMessage("<b>Too many requests at once, please try again in about a minute.</b>");
                    }
                })
            } else {
                resolve(this.#conceptCache[word]);
            }
        })
    }


    loadConceptCache() {
        return new Promise((resolve, reject) => {
            if (this.#isAlreadyLoading) {
                const checker = setInterval(() => {
                    if (Object.keys(this.#conceptCache).length > 0) {
                        resolve(this.#conceptCache);
                        clearInterval(checker);
                    }
                }, 500);
            } else if (Object.keys(this.#conceptCache).length == 0) {
                this.#isAlreadyLoading = true;
    
                const startTime = new Date();
                console.log("Populating concepts cache from local file...")
                d3.json("static/data/concepts.json", function(conceptsFromFile) {
                    Object.assign(this.#conceptCache, conceptsFromFile);
                    console.log(`Populating concepts cache from local file... (complete in ${new Date() - startTime}ms)`)
                    resolve(this.#conceptCache);
                }.bind(this));
            } else {
                resolve(this.#conceptCache);
            }
        });
    }

    render_local_words(localised_words, 
                        isHighFrequencyCall, 
                        onLocalWordClick) {
        d3.selectAll(`#${this.#mapViewId} .local_word`).remove();
        d3.select(`#${this.#mapViewId} .scatter`)
            .selectAll("text")
            .data(localised_words)
            .enter()
            .append("text")
            .attr("class", "local_word")
            .text((d) => d.word)
            .style("font-size", (d) => fontSize(d) + "px")
            .attr("x", function (d) {
                return d.x;
            })
            .attr("y", function (d) {
                return d.y;
            })
            .style("fill", function(d) {
                if (d.fill) return d.fill;
                return "#001617";
            })
            .style("font-weight", "bold")
            .style("stroke", function(d) {
                if (d.stroke) return d.stroke;
                return "white";
            })
            .style("stroke-width", 0.4)
            .on("mouseover", function (d) {
                if (d.concepts) {
                    const conceptualRelationIdx = d.concepts.indexOf(this.selectedLocalWord);
                    if (conceptualRelationIdx != -1) {
                        const conceptualRelation = d.rels[conceptualRelationIdx];
                        const tooltip_html = `
                            <table>
                                <tr>
                                    <td class="tooltip-table-cell"><b>Word</b></th>
                                    <td class="tooltip-table-cell">${d.word}</th>
                                </tr>
                                <tr>
                                    <td class="tooltip-table-cell"><b>Relation:</b></th>
                                    <td class="tooltip-table-cell">${conceptualRelation}</th>
                                </tr>
                                <tr>
                                    <td class="tooltip-table-cell"><b>Related concept:</b></td>
                                    <td class="tooltip-table-cell">${this.selectedLocalWord}</td>
                                </tr>
                            </table>
                        `;
                        showTooltip(TOOLTIP_ID, tooltip_html);
                    }
                }
            }.bind(this))
            .on("mousemove", () => moveTooltipsToCursor())
            .on("mouseout", () => hideTooltips())
            .on("click", function(d) {
                let occurrences;
                let related_words = [];
                let filter_name;

                const isConcept = d.occurrences[0].occurrences;
                if (isConcept) {
                    occurrences = [];
                    d.occurrences.forEach(local_word => {
                        occurrences = occurrences.concat(local_word.occurrences);

                        // Add extra information to the related words to show the user
                        local_word.fill = "dimgrey";
                        local_word.stroke = "black";

                        related_words.push(local_word);
                    });
                    filter_name = "Local concept";
                } else {
                    occurrences = d.occurrences;
                    filter_name = "Local word";
                } 

                occurrences = Array.from(new Set(occurrences));

                const idxs = occurrences.map(x => x.idx);
                const goldLabels = occurrences.map(x => x.ground_truth);
                const predictedLabels = occurrences.map(x => x.prediction);

                // update the probs
                related_words.forEach(word => {
                    word.prob = word.weight / idxs.length;
                })
                d.prob = d.weight / idxs.length;

               
                onLocalWordClick(
                    filter_name, 
                    idxs, 
                    (isConcept) ? related_words : [d], 
                    (isConcept) ? [d]: [],
                    goldLabels,
                    predictedLabels
                );
                this.render_local_words(related_words.concat(d), false, onLocalWordClick);
                this.selectedLocalWord = d.word;
            }.bind(this));

        if (isHighFrequencyCall != true) {
            // Apply force to prevent collision between texts
            this.#forceSimulation = d3
                .forceSimulation(localised_words)
                // .force("x", d3.forceX().x(d => d.x).strength(d => d.frequency/100))
                // .force("y", d3.forceY().y(d => d.y).strength(d => d.frequency/100))
                .force("collision", forceCollide())
                .on("tick", function () {
                    d3
                        .selectAll(".local_word")
                        .attr("x", function (d) {
                            return d.x; //- this.getBBox().width/2;
                        })
                        .attr("y", function (d) {
                            return d.y; // + this.getBBox().height/2;
                        });
                });
        }
    }

    notifyObservers(dataIdxs, msg, doNotUpdateLocalWords) {
        this.#observers.forEach((observer) => 
            observer.update(dataIdxs, 
                            msg,
                            doNotUpdateLocalWords));
    }

    addObserver(observer) {
        this.#observers.push(observer);
    } 

    setLocalWords(local_words) {
        this.#local_words = local_words;
    }

    setLocalConcepts(local_concepts) {
        this.#local_concepts = local_concepts;
    }

    get local_words() {
        return this.#local_words;
    }

    get local_concepts() {
        return this.#local_concepts;
    }

    get filteredData() {
        return this.#filteredData;
    }  

    get goldLabels() {
        return this.#goldLabels;
    }

    get predictedLabels() {
        return this.#predictedLabels;
    }

}


function orderOfMagnitude(num) {
    if (num == 0) return 0;
    return Math.floor(Math.log10(Math.abs(num)))
}

function showProgress(progress, total, msg) {
    if (total == 0) {
        hideProgress();
        return;
    }
    $("#progress-cover").remove();
    $("#container").append(`
        <div id="progress-cover">
            <div id="progress-current">
                Loading concepts:
                ${(100 * progress/total).toFixed(0)}%
                (${progress} out of ${total}).
            </div>
            <div id="progress-msg">${msg || ""}</div>
        </div>
    `);
}

function updateProgress(progress, total) {
    if (total == 0) {
        hideProgress();
        return;
    }
    if ($("#progress-cover").length == 0) {
        showProgress(progress, total)
    } else {
        $("#progress-current").html(`
            Loading concepts:
            ${(100 * progress/total).toFixed(0)}%
            (${progress} out of ${total}).
        `);
    }
}

function updateProgressMessage(msg) {
    $("#progress-msg").html(msg);
}

function hideProgress() {
    $("#progress-cover").remove();
}


function extractLocalFeatures(visible_dps, feature, total_num_of_leaf_visible_dps) {
    const show_stopwords = $("#show-stopwords").is(":checked");
    const invert = $("#invert").is(":checked");
    const n_grams = $("#how-many-grams").val();
    const locality_threshold = $("#localAreaThreshold").val();
    const freq_threshold_lower = parseInt(
        $((feature != "concept") ? "input.freqThreshold[data-index=0]"
            : "input.freqThreshold-concept[data-index=0]").val()
    );
    const freq_threshold_upper = parseInt(
        $((feature != "concept") ? "input.freqThreshold[data-index=1]"
        : "input.freqThreshold-concept[data-index=1]").val()
    );

    let word_occurrences = {};
    visible_dps.forEach(function (d, i) {
        let words = extractFeatures(d, feature, n_grams);
        if (freq_threshold_lower == 1 && feature == "concept") {
            words = words.slice(0, 1);
        }
        if (words) {
            words.forEach(function (word) {
                if (!word) return;
                if (!show_stopwords
                   && STOP_WORDS.includes(word.toLowerCase()))
                    return;

                if (word in word_occurrences) {
                    word_occurrences[word].push(d);
                } else {
                    word_occurrences[word] = [d];
                }
            });
        }
    });

    const locality_shape = $('#locality-shape').val();
    let locality_fn = null;
    if (locality_shape == "square") {
        locality_fn = filterLocalWordsWithSquareLocality;
    } else if (locality_shape == "gaussian") {
        locality_fn = filterLocalWordsWithGaussianLocality;
    }

    // if a word is localised, then we display that word there
    const localised_words = locality_fn(
        Object.entries(word_occurrences),
        freq_threshold_lower,
        freq_threshold_upper,
        (feature == "concept") ? locality_threshold / 2 : locality_threshold,
        invert,
        (feature == "concept") ? total_num_of_leaf_visible_dps : visible_dps.length
    );
    return localised_words;
}


function filterLocalWordsWithSquareLocality(
    word_occurrences,
    freq_threshold_lower,
    freq_threshold_upper,
    locality_threshold,
    invert,
    total_num_of_visible_dps
) {
    const localised_words = [];
    word_occurrences.forEach(function (entry) {
        const [word, occurrences] = entry;
        const xs = [];
        const ys = [];
        occurrences.forEach(function (d) {
            xs.push(d.x);
            ys.push(d.y);
        });

        const [max_x, min_x] = [Math.max(...xs), Math.min(...xs)];
        const [max_y, min_y] = [Math.max(...ys), Math.min(...ys)];

        const x_range = max_x - min_x;
        const y_range = max_y - min_y;

        const count = occurrences.length; // occurrences.reduce((sum, x) => sum + (x.frequency || 1), 0);
        const is_within_frequency_threshold = count >= freq_threshold_lower &&
                                            count <= freq_threshold_upper;
        const is_within_locality_threshold = x_range < locality_threshold &&
                                            y_range < locality_threshold;

        const condition = is_within_frequency_threshold && is_within_locality_threshold;
        const inverted_condition = is_within_frequency_threshold && !is_within_locality_threshold;
        const weight = occurrences.reduce((sum, x) => sum + (x.frequency || 1), 0);
        if ((invert) ? inverted_condition : condition) {
            localised_words.push({
                word: word,
                frequency: count,
                weight: weight,
                prob: weight / total_num_of_visible_dps,
                x: min_x + x_range / 2,
                y: min_y + y_range / 2,
                occurrences: occurrences,
            });
        }
    });
    return localised_words;
}


function filterLocalWordsWithGaussianLocality(
    word_occurrences,
    freq_threshold_lower,
    freq_threshold_upper,
    locality_threshold,
    invert,
    total_num_of_visible_dps
) {
    // Assume the positions are normally distributed
    let get_mean = function (samples) {
        const sum = samples.reduce((a, b) => a + b, 0);
        const mean = sum / samples.length;
        return mean;
    };

    let get_std = function (samples, mean) {
        if (samples.length <= 1) return 0;
        const acc = samples.reduce((a, b) => a + (b - mean) ** 2, 0);
        return Math.sqrt(acc / (samples.length - 1));
    };

    let get_zscore = function (sample, mean, std) {
        return (sample - mean) / std;
    };

    const localised_words = [];
    word_occurrences.forEach(function (entry) {
        const [word, occurrences] = entry;
        if (occurrences.length < 1) return;
        const xs = [];
        const ys = [];
        occurrences.forEach(function (d) {
            xs.push(d.x);
            ys.push(d.y);
        });

        const [mean_x, mean_y] = [get_mean(xs), get_mean(ys)];
        const [std_x, std_y] = [get_std(xs, mean_x), get_std(ys, mean_y)];

        const count = occurrences.length; //occurrences.reduce((sum, x) => sum + (x.frequency || 1), 0);
        const is_within_frequency_threshold = count >= freq_threshold_lower &&
                                            count <= freq_threshold_upper;
        const is_within_locality_threshold = 2 * std_x < locality_threshold &&
                                                2 * std_y < locality_threshold

        const condition = is_within_frequency_threshold && is_within_locality_threshold;
        const inverted_condition = is_within_frequency_threshold && !is_within_locality_threshold;
        let weight;
        
        if (occurrences[0] && occurrences[0].frequency) {
            const occurrences_flat = occurrences.reduce((sum, x) => sum.concat(x.occurrences), []);
            const occurrence_set = new Set(occurrences_flat); // this is necessary for probs to not exceed 100%
            weight = occurrence_set.size;
        } else {
            weight = occurrences.length;
        }

        // if the word is frequent enough and
        // if 2*std is in locality threshold
        if ((invert) ? inverted_condition: condition) {
            localised_words.push({
                word: word,
                frequency: count,
                weight: weight,
                prob: weight / total_num_of_visible_dps,
                x: mean_x,
                y: mean_y,
                occurrences: occurrences,
            });
        }
    });
    return localised_words;
}


function extractFeatures(d, feature, n_grams) {
    if (feature == "concept") {
        const concepts = d.concepts;
        return concepts || [];
    } else if (["text", "ground_truth", "prediction"].includes(feature)) {
        const txt = d[feature || "text"];
        const regex = `\\b(\\w+${"\\s\\w+[.!?\\-']?\\w*".repeat(
            (feature == "text") ? n_grams - 1 : 0
        )})\\b`;
        const words = txt.toLowerCase().match(new RegExp(regex, "g"));
        return Array.from(new Set(words));
    } else if (feature == "word_len") {
        const word_len = d.text.split(" ").length;
        const bucket = bucketNumber(word_len);
        return [`${bucket} words`];
    } else if (feature == "char_len") {
        const word_len = d.text.length;
        const bucket = bucketNumber(word_len);
        return [`${bucket} characters`];
    }
}


function bucketNumber(num) {
    const bucket_bottom = 10 * Math.floor(num / 10);
    const bucket_top = 10 * Math.ceil(num / 10);
    if (bucket_bottom == bucket_top) {
        return `${bucket_bottom+1}-${bucket_bottom+10}`;
    } else {
        return `${bucket_bottom+1}-${bucket_top}`;
    }  
}


function fontSize(d) {
    const weight = (d.frequency != d.weight)? d.weight : d.frequency;
    return Math.min(20 + weight * 0.8, 100);
}

function forceCollide() {
    const padding = 2;
    const bbox = function (d) {
        const fontsize = fontSize(d);
        const width = d.word.length * 0.5 * fontsize;
        const height = 0.8 * fontsize;
        return {
            x: d.x,
            y: d.y - height,
            width: width,
            height: height,
        };
    };

    function force(alpha) {
        const nodes = force.nodes;
        const quad = d3.quadtree(
            nodes,
            (d) => d.x,
            (d) => d.y
        );
        for (const d of nodes) {
            quad.visit((q, x1, y1, x2, y2) => {
                let updated = false;
                if (q.data && q.data !== d) {
                    const d_bbox = bbox(d);
                    const q_bbox = bbox(q.data);

                    const d_cx = d_bbox.x + d_bbox.width / 2;
                    const d_cy = d_bbox.y + d_bbox.height / 2;

                    const q_cx = q_bbox.x + q_bbox.width / 2;
                    const q_cy = q_bbox.y + q_bbox.height / 2;

                    const x_diff = d_cx - q_cx;
                    const y_diff = d_cy - q_cy;

                    const x_dist = Math.abs(x_diff);
                    const y_dist = Math.abs(y_diff);

                    const x_spacing = d_bbox.width / 2 + q_bbox.width / 2 + padding;
                    const y_spacing = d_bbox.height / 2 + q_bbox.height / 2 + padding;

                    const overlap_x = x_spacing - x_dist;
                    const overlap_y = y_spacing - y_dist;

                    const freq_ratio_d = d.frequency / (d.frequency + q.data.frequency);
                    const freq_ratio_q = 1 - freq_ratio_d;

                    if (overlap_x > 0 && overlap_y > 0) {
                        // collision detected
                        if (overlap_x < overlap_y) {
                            d.x -= overlap_x * freq_ratio_q;
                            q.data.x += overlap_x * freq_ratio_d;
                        } else {
                            d.y -= overlap_y * freq_ratio_q;
                            q.data.y += overlap_y * freq_ratio_d;
                        }
                    }
                }
                return updated;
            });
        }
    }

    // force.initialize = (_) => (nodes = _);
    force.initialize = function(nodes) {
        force.nodes = nodes;
    }

    return force;
}


function convertCamelCaseToText(camelCaseString) {
    return camelCaseString.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export { hideProgress, LocalWordsView }