import { getStopwords } from "./stopwords.js";


const STOP_WORDS = getStopwords();
let forceSimulation;


// A function that counts word frequency in all visible dps
function showLocalWords(visibles, disableForce) {
    if (forceSimulation) {
        forceSimulation.stop();
    }

    const is_to_show_local_words = $("#show-local-words").is(":checked");
    const is_to_ignore_stopwords = $("#ignore-stopwords").is(":checked");
    const invert = $("#invert").is(":checked");
    const n_grams = $("#how-many-grams").val();
    const locality_threshold = $("#localAreaThreshold").val();
    const freq_threshold_lower = parseInt(
        $("input.freqThreshold[data-index=0]").val()
    );
    const freq_threshold_upper = parseInt(
        $("input.freqThreshold[data-index=1]").val()
    );
    const feature = $("#local-feature-type-select").val();

    if (!is_to_show_local_words || !n_grams || n_grams < 1) {
        d3.selectAll(".local_word").remove();
        return;
    }

    let word_positions = {};
    visibles.each(function (d) {
        const pos_x = this.transform.baseVal[0].matrix.e;
        const pos_y = this.transform.baseVal[0].matrix.f;

        const words = extractFeatures(d, feature, n_grams)
        if (words) {
            words.forEach(function (word) {
                if (
                    is_to_ignore_stopwords &&
                    STOP_WORDS.includes(word.toLowerCase())
                )
                    return;

                if (word in word_positions) {
                    word_positions[word].push([pos_x, pos_y]);
                } else {
                    word_positions[word] = [[pos_x, pos_y]];
                }
            });
        }
    });

    const locality_shape = $('input[name="locality-shape"]:checked').val();
    let locality_fn = null;
    if (locality_shape == "square") {
        locality_fn = filterLocalWordsWithSquareLocality;
    } else if (locality_shape == "gaussian") {
        locality_fn = filterLocalWordsWithGaussianLocality;
    }

    // if a word is localised, then we display that word there
    const localised_words = locality_fn(
        Object.entries(word_positions),
        freq_threshold_lower,
        freq_threshold_upper,
        locality_threshold,
        invert
    );

    d3.selectAll(".local_word").remove();
    d3.select("#scatter")
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
        .style("fill", "#001617")
        .style("font-weight", "bold")
        .style("stroke", "white")
        .style("stroke-width", 0.4);

    if (disableForce != true) {
        // Apply force to prevent collision between texts
        forceSimulation = d3
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


function filterLocalWordsWithSquareLocality(
    word_positions,
    freq_threshold_lower,
    freq_threshold_upper,
    locality_threshold,
    invert
) {
    const localised_words = [];
    word_positions.forEach(function (entry) {
        const [word, positions] = entry;
        const xs = [];
        const ys = [];
        positions.forEach(function (pos) {
            const [x, y] = pos;
            xs.push(x);
            ys.push(y);
        });

        const [max_x, min_x] = [Math.max(...xs), Math.min(...xs)];
        const [max_y, min_y] = [Math.max(...ys), Math.min(...ys)];

        const x_range = max_x - min_x;
        const y_range = max_y - min_y;

        const is_within_frequency_threshold = positions.length >= freq_threshold_lower &&
                                            positions.length <= freq_threshold_upper;
        const is_within_locality_threshold = x_range < locality_threshold &&
                                            y_range < locality_threshold;

        const condition = is_within_frequency_threshold && is_within_locality_threshold;
        const inverted_condition = is_within_frequency_threshold && !is_within_locality_threshold;
        if ((invert) ? inverted_condition : condition) {
            localised_words.push({
                word: word,
                frequency: positions.length,
                x: min_x + x_range / 2,
                y: min_y + y_range / 2,
            });
        }
    });
    return localised_words;
}


function filterLocalWordsWithGaussianLocality(
    word_positions,
    freq_threshold_lower,
    freq_threshold_upper,
    locality_threshold,
    invert
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
    word_positions.forEach(function (entry) {
        const [word, positions] = entry;
        if (positions.length < 1) return;
        const xs = [];
        const ys = [];
        positions.forEach(function (pos) {
            const [x, y] = pos;
            xs.push(x);
            ys.push(y);
        });

        const [mean_x, mean_y] = [get_mean(xs), get_mean(ys)];
        const [std_x, std_y] = [get_std(xs, mean_x), get_std(ys, mean_y)];

        const is_within_frequency_threshold = positions.length >= freq_threshold_lower &&
                                            positions.length <= freq_threshold_upper;
        const is_within_locality_threshold = 2 * std_x < locality_threshold &&
                                                2 * std_y < locality_threshold

        const condition = is_within_frequency_threshold && is_within_locality_threshold;
        const inverted_condition = is_within_frequency_threshold && !is_within_locality_threshold;
        // if the word is frequent enough and
        // if 2*std is in locality threshold
        if ((invert) ? inverted_condition: condition) {
            localised_words.push({
                word: word,
                frequency: positions.length,
                x: mean_x,
                y: mean_y,
            });
        }
    });
    return localised_words;
}


function extractFeatures(d, feature, n_grams) {
    if (["text", "ground_truth", "prediction"].includes(feature)) {
        const txt = d[feature || "text"];
        const regex = `\\b(\\w+${"\\s\\w+[.!?\\-']?\\w*".repeat(
            n_grams - 1
        )})\\b`;
        const words = txt.match(new RegExp(regex, "g"));
        return words;
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
    return Math.min(15 + d.frequency * 0.2, 80);
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


export { showLocalWords }