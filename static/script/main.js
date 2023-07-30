const RELCHART_LEFT_WIDTH = 200;

// make widgets collapsible
$(".widget_title").click(function () {
    $(this).parent().find(".widget_content").slideToggle();
});

// set the dimensions and margins of the graph
let margin = { top: 10, right: 30, bottom: 30, left: 60 },
    width = 1000 - margin.left - margin.right,
    height = 900 - margin.top - margin.bottom;

// append the SVG object to the body of the page
let SVG = d3
    .select("svg#semantic_landscape")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .select("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Add a clipPath: everything out of this area won't be drawn.
let clip = SVG.append("defs")
    .append("SVG:clipPath")
    .attr("id", "clip")
    .append("SVG:rect")
    .attr("width", width)
    .attr("height", height)
    .attr("x", 0)
    .attr("y", 0);

let drag_line = SVG.append("line")
    .attr("clip-path", "url(#clip)")
    .attr("id", "drag-line-0")
    .attr("class", "drag_line")
    .style("visibility", "hidden")
    .attr("stroke", "lightblue")
    .attr("stroke-width", "3");
let drag_line1 = SVG.append("line")
    .attr("clip-path", "url(#clip)")
    .attr("id", "drag-line-1")
    .attr("class", "drag_line")
    .style("visibility", "hidden")
    .attr("stroke", "lightblue")
    .attr("stroke-width", "3");

let dim_reduction = "tsne";

const DATASETS = ["banking", "hwu", "clinc"];
const DATASET_NAME = "banking";
const NUM_CLUSTERS = 12;

$("#dataset_name").html(`<b>${DATASET_NAME.toUpperCase()}</b>`);

//Read the data
d3.json(
    `static/data/${DATASET_NAME.toLowerCase()}-viz_data-${NUM_CLUSTERS}-clusters-intent_cluster_chosen_by_majority_in-predicted-intent.json`,
    function (data) {
        // Parse data structure
        const cluster_to_color = d3.schemeSet3;
        const cluster_to_intent = {};
        const intent_to_cluster = {};

        data.forEach(function (d) {
            if (!cluster_to_intent[d.intent_cluster]) {
                cluster_to_intent[d.intent_cluster] = new Set([d.ground_truth]);
            } else {
                cluster_to_intent[d.intent_cluster].add(d.ground_truth);
            }

            if (!intent_to_cluster[d.prediction_label_idx]) {
                intent_to_cluster[d.prediction_label_idx] = d.intent_cluster;
            }
        });

        // Identify errors
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

        const accuracy = 100 - (errors.length / data.length) * 100;
        $("#accuracy").html(`<b>${accuracy.toFixed(1)}</b>`);

        // Create the table data
        const confusion_table = [];
        for (const confusion_key in confusions) {
            const [gt, pred] = confusion_key.split(",");
            const txts = confusions[confusion_key];

            confusion_table.push([gt, pred, txts.length]);
        }

        const confusion_table_gt_sorted = [...confusion_table];
        const confusion_table_pred_sorted = [...confusion_table];
        const confusion_table_num_confusions_sorted = [...confusion_table];

        confusion_table_gt_sorted
            .sort(function (row1, row2) {
                return gt_counts[row1[0]] - gt_counts[row2[0]];
            })
            .reverse();

        confusion_table_pred_sorted
            .sort(function (row1, row2) {
                return pred_counts[row1[1]] - pred_counts[row2[1]];
            })
            .reverse();

        confusion_table_num_confusions_sorted
            .sort(function (row1, row2) {
                return row1[2] - row2[2];
            })
            .reverse();

        // Create the table html from the data
        let populate_html_confusion_table = function (data) {
            let html = "";
            data.forEach(function ([gt, pred, num_confusions]) {
                html += `<tr class="error_tr" gt="${gt}" pred="${pred}">
                    <td class="small_td">${gt}</td>
                    <td class="small_td">${pred}</td>
                    <td class="xs_td">${num_confusions}</td>
                </tr>`;
            });
            $("#confusion-table tr").first().after(html);
            // Add click event to rows
            $(".error_tr").click(function (d) {
                const gt = d3.select(this).attr("gt");
                const pred = d3.select(this).attr("pred");
                filterByIntents([gt, pred]);

                $(".selected-tr").removeClass("selected-tr");
                $(this).addClass("selected-tr");
            });
        };

        populate_html_confusion_table(confusion_table_gt_sorted);

        // Add click event to header row
        $("#confusion-table th").click(function () {
            const col_type = $(this).attr("column_type");
            if (col_type == "pred") {
                populate_html_confusion_table(confusion_table_pred_sorted);
            } else if (col_type == "gt") {
                populate_html_confusion_table(confusion_table_gt_sorted);
            } else if (col_type == "num_confusions") {
                populate_html_confusion_table(confusion_table_num_confusions_sorted);
            }
        });

        $(document)
            .ready(function () {
                const dim_reduction_option = $('input[name="dim-reduction"]');
                const groupby_option = $('input[name="group-by"]');
                const filterby_option = $('input[name="filter-by"]');
                const is_to_show_errors_only = $("#show-errors");
                const filter_input = $("#filter");
                const clear_btn = $("#clear-filter");
                const intent_filter = $("#intent_filter");

                // Toggle local words
                $("#show-local-words").change(function () {
                    // fade the datapoints
                    d3.selectAll("path.datapoint").style("stroke-opacity", function (d) {
                        const current_opacity = d3.select(this).style("stroke-opacity");

                        if (current_opacity == 1) {
                            return 0.6;
                        } else {
                            return 1;
                        }
                    });

                    // show the local words
                    updateLocalWords();
                });
                $("#how-many-grams").change(updateLocalWords);
                const stopwords = get_stopwords();
                $("#ignore-stopwords").change(updateLocalWords);

                // Locality shape
                $('input[name="locality-shape"]').change(updateLocalWords);

                // Local area size threshold
                $("#localAreaThreshold")
                    .on("mousedown", function () {
                        const locality_shape = $(
                            'input[name="locality-shape"]:checked'
                        ).val();
                        scatter
                            .append("rect")
                            .attr("id", "localitySizer")
                            .attr("visibility", "hidden")
                            .attr("stroke", "red")
                            .attr("stroke-width", 1)
                            .attr("fill", "rgba(255, 0, 0, 0.2)")
                            .attr("x", width / 2)
                            .attr("y", height / 2);
                    })
                    .on("mouseup", function () {
                        d3.select("#localitySizer").remove();
                    })
                    .on("change", updateLocalWords)
                    .on("input", function () {
                        const localitySize = $(this).val();
                        d3.select("#localitySizer")
                            .attr("visibility", "visible")
                            .attr("width", localitySize)
                            .attr("height", localitySize)
                            .attr("r", localitySize)
                            .attr("x", width / 2 - localitySize / 2)
                            .attr("y", height / 2 - localitySize / 2);
                        updateLocalWords();
                    });

                // Frequency threshold
                $("input.freqThreshold").change(updateLocalWords);

                // Intent filter
                Object.entries(cluster_to_intent).forEach(function (entry) {
                    const [cluster, labels] = entry;
                    const intent_set = new Set(labels);
                    let color = cluster_to_color[cluster];
                    color = d3.color(color).brighter(0.2);

                    let optgroup_content = "";
                    intent_set.forEach(
                        (intent) =>
                            (optgroup_content += `<option value="${intent}" style="background-color: ${color}">${intent}</option>`)
                    );
                    intent_filter.append(
                        `<optgroup label="Cluster #${cluster}">${optgroup_content}</optgroup>`
                    );
                });

                intent_filter
                    .change(function () {
                        const intents = $(this).val();
                        filterByIntents(intents);
                    })
                    .click(function () {
                        const intents = $(this).val();
                        filterByIntents(intents);
                    });

                // Dimension reduction method
                dim_reduction_option.change(function () {
                    const dim_reduction_attr = $(
                        'input[name="dim-reduction"]:checked'
                    ).val(); // TO REFACTOR: use const and let instead of let or vice versa consistently
                    dim_reduction = dim_reduction_attr;
                    const [x, y] = getXYScales(data);
                    drawHulls(
                        dim_reduction == "tsne"
                            ? intents_to_points_tsne
                            : intents_to_points_umap
                    );
                    updatePositions(x, y);
                    updateLocalWords();
                    filterHulls([]);
                });

                // Group-by (colour-by) option
                groupby_option.change(function () {
                    const groupby_attr = $('input[name="group-by"]:checked').val(); // TO REFACTOR: use const and let instead of let or vice versa consistently
                    d3.selectAll(".datapoint").style("fill", function (d) {
                        const idx = parseInt(d[groupby_attr]);
                        return cluster_to_color[idx];
                    });
                });

                // Filter-by (filter-by) option
                filterby_option.change(function () {
                    d = d3.select(".selected-dp").data();
                    filter_by_dp_attr(d[0]);
                });

                // Show errors only?
                let idxs_before_error_filter = null;
                is_to_show_errors_only.on("change", function() {
                    idxs_before_error_filter = showCurrentErrors(idxs_before_error_filter)
                });

                // Show confidence?
                $("#show-confidence").on("change", function () {
                    if ($("#show-confidence").is(":checked")) {
                        // color in the same way and differentiate by opacity
                        const confidence_color = "#89A4C7";

                        d3.selectAll("path.datapoint")
                            // .attr("stroke", d => d3.color(d3.interpolateMagma(0.9 * calculate_confidence(d))).darker())
                            .attr("fill", (d) => confidence_color)
                            .attr("stroke", (d) => d3.color(confidence_color).darker(0.3))
                            .attr("fill-opacity", (d) =>
                                Math.max(0.2, calculate_confidence(d))
                            );
                    } else {
                        // switch back to normal coloring
                        d3.selectAll("path.datapoint")
                            .attr("fill", function (d) {
                                let label = parseInt(d["intent_cluster"]);
                                return cluster_to_color[label];
                            })
                            .attr("fill-opacity", 1)
                            .attr("stroke", "#9299a1");
                    }
                });

                // Add a confidence range filter
                $("input.confThreshold").change(filterByConfidence);

                // Show local words?
                is_to_show_errors_only.change(updateLocalWords);

                // Filter input
                filter_input.on("input", function (e) {
                    let [visibles, gold_intent_set, predicted_intent_set] =
                        getVisibleDatapoints(); // TO REFACTOR: reduce the call to getVisibleDatapoints() when updateSymbols is called in the same context

                    const filter_value = e.target.value;
                    const filter_phrases = filter_value.split(",");

                    const filter_idxs = visibles
                        .filter(function (d) {
                            return filter_phrases.every(function (phrase) {
                                return d.text.includes(phrase);
                            });
                        })
                        .data()
                        .map((d) => d.idx);
                    if (filter_idxs.length == 0) {
                        filterChart([-1]);
                    } else {
                        filterChart(filter_idxs);
                    }
                });

                // Clear button
                clear_btn.on("click", function (e) {
                    clear();
                });
            })
            .keyup(function (e) {
                if (e.key === "Escape") {
                    // escape key maps to keycode `27`
                    clear();
                }
            });

        // Set the zoom and Pan features: how much you can zoom, on which part, and what to do when there is a zoom
        let zoom = d3
            .zoom()
            .scaleExtent([0.8, 100]) // This control how much you can unzoom (x0.5) and zoom (x20)
            .extent([
                [0, 0],
                [width, height],
            ])
            .on("zoom", updateChart)
            .on("start", function () {
                scatter.selectAll(".local_word").remove();
            })
            .on("end", function () {
                updateSymbols();
                updateLocalWords();
            });

        // This add an invisible rect on top of the chart area. This rect can recover pointer events: necessary to understand when the user zoom
        SVG.append("rect")
            .attr("width", width)
            .attr("height", height)
            .style("fill", "none")
            .style("pointer-events", "all")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
            .call(zoom);
        // now the user can zoom and it will trigger the function called updateChart

        let xMin = Math.min(...data.map((d) => d["tsne-dim0"]));
        let xMax = Math.max(...data.map((d) => d["tsne-dim0"]));
        let xRange = xMax - xMin;

        let yMin = Math.min(...data.map((d) => d["tsne-dim1"]));
        let yMax = Math.max(...data.map((d) => d["tsne-dim1"]));
        let yRange = yMax - yMin;

        // Add X axis
        let x = d3
            .scaleLinear()
            .domain([xMin - 0.1 * xRange, xMax + 0.1 * xRange])
            .range([0, width]);
        let xAxis = SVG.append("g")
            .attr("transform", "translate(0," + height + ")")
            .call(d3.axisBottom(x));

        // Add Y axis
        let y = d3
            .scaleLinear()
            .domain([yMin - 0.1 * yRange, yMax + 0.1 * yRange])
            .range([height, 0]);
        let yAxis = SVG.append("g").call(d3.axisLeft(y));

        let newX = x;
        let newY = y;

        // Create the scatter variable
        let scatter = SVG.append("g").attr("clip-path", "url(#clip)");

        // Create a drag behaviour
        let current_dragline;
        let drag = d3
            .drag()
            .on("start", function (d) {
                const [x, y] = get_position(this);
                const drag_line0 = d3.select("#drag-line-0");
                const drag_line1 = d3.select("#drag-line-1");

                if (
                    drag_line0.attr("x1") == x &&
                    drag_line0.attr("y1") == y &&
                    drag_line0.style("visibility") == "visible"
                ) {
                    current_dragline = drag_line1;
                } else {
                    drag_line1.style("visibility", "hidden");
                    current_dragline = drag_line0;
                }

                current_dragline
                    .attr("x1", x)
                    .attr("y1", y)
                    .attr("x2", x)
                    .attr("y2", y)
                    .style("visibility", "visible");
            })
            .on("drag", function (d) {
                current_dragline.attr("x2", d3.event.x).attr("y2", d3.event.y);
            })
            .on("end", function (d) {
                const mouseover_dp = d3.select(".ismouseover");
                if (mouseover_dp.empty()) {
                    current_dragline.style("visibility", "hidden");
                } else {
                    const [x2, y2] = get_position(mouseover_dp.node());
                    const mouseover_dp_data = mouseover_dp.data();
                    current_dragline
                        .attr("x2", x2)
                        .attr("y2", y2)
                        .data([
                            {
                                x1: d[`${dim_reduction}-dim0`],
                                y1: d[`${dim_reduction}-dim1`],
                                x2: mouseover_dp_data[0][`${dim_reduction}-dim0`],
                                y2: mouseover_dp_data[0][`${dim_reduction}-dim1`],
                            },
                        ]);

                    const idx1 = d.idx;
                    const idx2 = mouseover_dp_data[0].idx;
                    updateRelationChart(idx1, idx2);
                }
            });

        // Add datapoints
        const symbolNames = [
            "Circle",
            "Cross",
            "Diamond",
            "Square",
            "Star",
            "Triangle",
            "Wye",
        ];

        const symbols = symbolNames.map((name) =>
            d3.symbol().type(d3[`symbol${name}`]).size(150)
        );

        let customSymbolDownTriangle = {
            draw: function (context, size) {
                let s = Math.sqrt(size);
                context.moveTo(0, s / 2);
                context.lineTo(s, -s);
                context.lineTo(-s, -s);
                // context.lineTo(-s,s);
                context.closePath();
            },
        };

        symbols.push(d3.symbol().type(customSymbolDownTriangle).size(100));

        // before drawing the points, draw polygonHulls around each intent group
        const intents_to_points_tsne = {};
        const intents_to_points_umap = {};

        data.forEach(function (d) {
            const x_pos_tsne = d[`tsne-dim0`];
            const y_pos_tsne = d[`tsne-dim1`];
            const x_pos_umap = d[`umap-dim0`];
            const y_pos_umap = d[`umap-dim1`];

            // save the locations for later
            if (!intents_to_points_tsne[d.ground_truth_label_idx]) {
                intents_to_points_tsne[d.ground_truth_label_idx] = [
                    [x_pos_tsne, y_pos_tsne],
                ];
            } else {
                intents_to_points_tsne[d.ground_truth_label_idx].push([
                    x_pos_tsne,
                    y_pos_tsne,
                ]);
            }

            if (!intents_to_points_umap[d.ground_truth_label_idx]) {
                intents_to_points_umap[d.ground_truth_label_idx] = [
                    [x_pos_umap, y_pos_umap],
                ];
            } else {
                intents_to_points_umap[d.ground_truth_label_idx].push([
                    x_pos_umap,
                    y_pos_umap,
                ]);
            }
        });

        drawHulls(
            dim_reduction == "tsne" ? intents_to_points_tsne : intents_to_points_umap
        );

        function drawHulls(intents2points) {
            const polyHullsData = {};
            for (const intent in intents2points) {
                const pts = intents2points[intent];
                const hull = d3.polygonHull(pts);
                polyHullsData[intent] = hull;
            }

            scatter.selectAll("path.intentHull").remove();
            scatter
                .selectAll("path.intentHull")
                .data(Object.entries(polyHullsData))
                .enter()
                .append("path")
                .attr("class", "intentHull")
                .attr("d", function (d) {
                    const [intent, pts] = d;
                    const scaled_pts = pts.map(function (pt) {
                        return [x(pt[0]), y(pt[1])];
                    });
                    return `M${scaled_pts.join("L")}Z`;
                })
                .style("stroke", "lightblue")
                .style("fill-opacity", "0.3")
                .style("fill", function (d) {
                    const [intent, pts] = d;
                    return cluster_to_color[intent_to_cluster[intent]];
                })
                .attr("visibility", "hidden")
                .style("pointer-events", "none");
        }

        // draw the points
        scatter
            .selectAll("path.datapoint")
            .data(data)
            .enter()
            .append("path")
            .attr("class", "datapoint")
            .attr("d", d3.symbol().type(d3.symbolCircle).size(150))
            .attr("stroke", "#9299a1")
            .attr("fill", function (d) {
                let label = parseInt(d["intent_cluster"]);
                return cluster_to_color[label];
            })
            .attr("transform", function (d) {
                const x_pos = d[`${dim_reduction}-dim0`];
                const y_pos = d[`${dim_reduction}-dim1`];
                const translation = "translate(" + x(x_pos) + "," + y(y_pos) + ")";
                return translation;
            })
            .on("mouseover", show_tooltip)
            .on("mousemove", move_tooltip_to_cursor)
            .on("mouseout", hide_tooltip)
            .on("click", onclick)
            .call(drag);

        // Initialise a variable for keeping track of currently visible datapoints
        let currently_visible_dps = scatter.selectAll(".datapoint");

        // create a tooltip
        let tooltip = d3
            .select("#container")
            .append("div")
            .style("position", "absolute")
            .style("visibility", "hidden")
            .style("background-color", "black")
            .style("border-radius", "5px")
            .style("opacity", 0.8)
            .style("color", "white")
            .style("border", "2px solid black")
            .style("padding", "10px")
            .style("z-index", 1000);

        let forceSimulation;
        updateLocalWords();

        function showCurrentErrors(idxs_before_error_filter) {
            if ($("#show-errors").is(":checked")) {
                let [visibles, gold_intent_set, predicted_intent_set] =
                    getVisibleDatapoints(); // TO REFACTOR: reduce the call to getVisibleDatapoints() when updateSymbols is called in the same context

                idxs_before_error_filter = visibles.data().map((d) => d.idx);
                const idxs = visibles
                    .filter((d) => errors_idxs.includes(d.idx))
                    .data()
                    .map((d) => d.idx);
                filterChart(idxs);
            } else {
                filterChart(idxs_before_error_filter || []);
            }
            return idxs_before_error_filter
        }

        function filterByConfidence() {
            const conf_threshold_lower =
                parseInt($("input.confThreshold[data-index=0]").val()) || 0;
            const conf_threshold_upper =
                parseInt($("input.confThreshold[data-index=1]").val()) || 100;

            let starting_list;
            if ($("#show-errors").is(":checked")) {
                starting_list = data.filter((d) => errors_idxs.includes(d.idx));
            } else {
                starting_list = data;
            }

            const filter_idxs = starting_list
                .filter(function (d) {
                    const confidence = calculate_confidence(d) * 100;
                    return (
                        conf_threshold_lower < confidence &&
                        confidence < conf_threshold_upper
                    );
                })
                .map((d) => d.idx);
            if (filter_idxs.length == 0) {
                filterChart([-1]);
            } else {
                filterChart(filter_idxs);
            }
        }

        function calculate_confidence(d) {
            const tau = 15;

            let probs = softmax(d.distances[0].map((dist) => dist / tau));
            probs = probs.sort((a, b) => b - a);
            const confidence = probs[0] - probs[1];
            return confidence;
        }

        // A function that counts word frequency in all visible dps
        function updateLocalWords(disableForce) {
            if (forceSimulation) {
                forceSimulation.stop();
            }

            const is_to_show_local_words = $("#show-local-words").is(":checked");
            const is_to_ignore_stopwords = $("#ignore-stopwords").is(":checked");
            const n_grams = $("#how-many-grams").val();
            const locality_threshold = $("#localAreaThreshold").val();
            const freq_threshold_lower = parseInt(
                $("input.freqThreshold[data-index=0]").val()
            );
            const freq_threshold_upper = parseInt(
                $("input.freqThreshold[data-index=1]").val()
            );

            if (!is_to_show_local_words || !n_grams || n_grams < 1) {
                scatter.selectAll(".local_word").remove();
                return;
            }

            let [visibles, gold_intent_set, predicted_intent_set] =
                getVisibleDatapoints(); // TO REFACTOR: reduce the call to getVisibleDatapoints() when updateSymbols is called in the same context
            let word_positions = {};

            visibles.each(function (d) {
                const pos_x = this.transform.baseVal[0].matrix.e;
                const pos_y = this.transform.baseVal[0].matrix.f;
                const txt = d.text;
                const regex = `\\b(\\w+${"\\s\\w+[.!?\\-']?\\w*".repeat(
                    n_grams - 1
                )})\\b`;
                const words = txt.match(new RegExp(regex, "g"));
                if (words) {
                    words.forEach(function (word) {
                        if (
                            is_to_ignore_stopwords &&
                            stopwords.includes(word.toLowerCase())
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

            word_positions = Object.entries(word_positions);

            const locality_shape = $('input[name="locality-shape"]:checked').val();
            let locality_fn = null;
            if (locality_shape == "square") {
                locality_fn = filterLocalWordsWithSquareLocality;
            } else if (locality_shape == "gaussian") {
                locality_fn = filterLocalWordsWithGaussianLocality;
            }

            // if a word is localised, then we display that word there
            const localised_words = locality_fn(
                word_positions,
                freq_threshold_lower,
                freq_threshold_upper,
                locality_threshold
            );
            scatter.selectAll(".local_word").remove();
            scatter
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

            if (!disableForce) {
                // Apply force to prevent collision between texts
                forceSimulation = d3
                .forceSimulation(localised_words)
                // .force("x", d3.forceX().x(d => d.x).strength(d => d.frequency/100))
                // .force("y", d3.forceY().y(d => d.y).strength(d => d.frequency/100))
                .force("collision", forceCollide())
                .on("tick", function () {
                    scatter
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

        function filterLocalWordsWithSquareLocality(
            word_positions,
            freq_threshold_lower,
            freq_threshold_upper,
            locality_threshold
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
                if (
                    positions.length >= freq_threshold_lower &&
                    positions.length <= freq_threshold_upper &&
                    x_range < locality_threshold &&
                    y_range < locality_threshold
                ) {
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
            locality_threshold
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
                // if the word is frequent enough and
                // if 2*std is in locality threshold
                if (
                    positions.length >= freq_threshold_lower &&
                    positions.length <= freq_threshold_upper &&
                    2 * std_x < locality_threshold &&
                    2 * std_y < locality_threshold
                ) {
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

        // A function that updates the chart when the user zoom and thus new boundaries are available
        function updateChart() {
            // recover the new scale
            newX = d3.event.transform.rescaleX(x);
            newY = d3.event.transform.rescaleY(y);

            // update axes with these new boundaries
            xAxis.call(d3.axisBottom(newX));
            yAxis.call(d3.axisLeft(newY));

            updatePositions(newX, newY);

            d3.selectAll(".drag_line")
                .filter((d) => Boolean(d))
                .attr("x1", function (d) {
                    return newX(d.x1);
                })
                .attr("y1", function (d) {
                    return newY(d.y1);
                })
                .attr("x2", function (d) {
                    return newX(d.x2);
                })
                .attr("y2", function (d) {
                    return newY(d.y2);
                });
            updateLocalWords(true);
        }

        function getXYScales(data) {
            // TO REFACTOR: use this instead of repetition
            xMin = Math.min(...data.map((d) => d[`${dim_reduction}-dim0`]));
            xMax = Math.max(...data.map((d) => d[`${dim_reduction}-dim0`]));
            xRange = xMax - xMin;

            yMin = Math.min(...data.map((d) => d[`${dim_reduction}-dim1`]));
            yMax = Math.max(...data.map((d) => d[`${dim_reduction}-dim1`]));
            yRange = yMax - yMin;

            // Add X axis
            let x = d3
                .scaleLinear()
                .domain([xMin - 0.1 * xRange, xMax + 0.1 * xRange])
                .range([0, width]);

            // Add Y axis
            let y = d3
                .scaleLinear()
                .domain([yMin - 0.1 * yRange, yMax + 0.1 * yRange])
                .range([height, 0]);

            return [x, y];
        }

        function updatePositions(xScale, yScale) {
            // update positions
            scatter.selectAll("path.datapoint").attr("transform", function (d) {
                const translation =
                    "translate(" +
                    xScale(d[`${dim_reduction}-dim0`]) +
                    "," +
                    yScale(d[`${dim_reduction}-dim1`]) +
                    ")";
                return translation;
            });
            // update hulls
            scatter.selectAll("path.intentHull").attr("d", function (d) {
                const [intent, pts] = d;
                const scaled_hull = pts.map((pt) => [xScale(pt[0]), yScale(pt[1])]);
                return `M${scaled_hull.join("L")}Z`;
            });
        }

        let currentHulls = null;

        function filterHulls(intents) {
            currentHulls = intents;

            scatter.selectAll("path.intentHull").attr("visibility", function (d) {
                let [intent, pts] = d;
                intent = parseInt(intent);
                if (intents.includes(intent)) {
                    return "visible";
                } else {
                    return "hidden";
                }
            });
        }

        function filterByIntents(intents) {
            if (intents.length < 1) {
                clear();
            } else {
                const dp_idxs = data
                    .filter((d) => intents.includes(d.ground_truth))
                    .map((d) => d.idx);
                filterChart(dp_idxs);
                let [visibles, gold_intent_set, predicted_intent_set] =
                    getVisibleDatapoints();
                filterHulls(gold_intent_set);
            }
        }

        function updateSymbols() {
            let [visibles, gold_intent_set, predicted_intent_set] =
                getVisibleDatapoints();

            currently_visible_dps = visibles;

            if (gold_intent_set.length <= symbols.length) {
                const intents_with_symbols = Object.keys(previous_intent_symbol_map)
                    .map((k) => parseInt(k))
                    .filter((k) => gold_intent_set.includes(k));
                const intents_without_symbols = gold_intent_set.filter(
                    (intent) => !intents_with_symbols.includes(intent)
                );
                const used_symbols = intents_with_symbols.map(
                    (k) => previous_intent_symbol_map[k]
                );
                const remaining_symbols = symbols.filter(
                    (sym) => !used_symbols.includes(sym)
                );

                if (intents_without_symbols.length > remaining_symbols.length) {
                    throw new Error(
                        "There aren't enough symbols to assign to the newly visible intents: " +
                        `${intents_without_symbols.length} !< ${remaining_symbols.length}`
                    );
                }

                const intent_to_symbol = Object.fromEntries(
                    intents_without_symbols.map((intent, i) => [
                        intent,
                        remaining_symbols[i],
                    ])
                );
                currently_visible_dps.attr("d", function (d) {
                    const intent = d.ground_truth_label_idx;
                    if (intents_with_symbols.includes(intent)) {
                        return previous_intent_symbol_map[intent](d);
                    } else {
                        return intent_to_symbol[intent](d);
                    }
                });

                previous_intent_symbol_map = Object.assign(
                    previous_intent_symbol_map,
                    intent_to_symbol
                );
            } else {
                currently_visible_dps.attr(
                    "d",
                    d3.symbol().type(d3.symbolCircle).size(150)
                );
            }
        }

        let previous_intent_symbol_map = {};

        function getVisibleDatapoints() {
            let gold_intents = [];
            let predicted_intents = [];

            const visibles = scatter.selectAll(".datapoint").filter(function (d) {
                let x = this.transform.baseVal[0].matrix.e;
                let y = this.transform.baseVal[0].matrix.f;

                let is_visible = d3.select(this).style("visibility") == "visible";
                is_visible = is_visible && 0 < x && x < width && 0 < y && y < height;
                if (is_visible) {
                    gold_intents.push(d["ground_truth_label_idx"]);
                    predicted_intents.push(d["prediction_label_idx"]);
                }
                return is_visible;
            });

            let gold_intent_set = [...new Set(gold_intents)];
            let predicted_intent_set = [...new Set(predicted_intents)];

            return [
                visibles,
                Array.from(gold_intent_set),
                Array.from(predicted_intent_set),
            ];
        }

        function filterChart(idxs) {
            d3.selectAll(".datapoint").attr("visibility", function (d) {
                if (idxs.length == 0) return "visible";
                if (idxs.includes(d.idx)) {
                    return "visible"; // TO REFACTOR: use semi-colons consistently
                } else {
                    return "hidden";
                }
            });

            updateSymbols();
            updateLocalWords();
            d3.selectAll(".drag_line").style("visibility", "hidden");
        }

        function clear() {
            $("#filter").val("");

            filterByConfidence();
            filterHulls([]);

            $(".selected-dp")
                .attr("stroke", "#9299a1")
                .attr("stroke-width", "1px")
                .removeClass("selected-dp");
        }

        function show_tooltip(d) {
            // TO REFACTOR: use either camelCase or snake_case but not both
            move_tooltip_to_cursor();
            $(this).addClass("ismouseover");

            const attrs_to_show = ["idx", "text", "ground_truth", "prediction"];
            const tooltip_html = Object.entries(d).reduce(
                (acc, current) =>
                    acc +
                    (attrs_to_show.includes(current[0])
                        ? `<p><b>${current[0]}</b>: ${current[1]}</p>`
                        : ""),
                ""
            );
            tooltip.html(tooltip_html);
            return tooltip.style("visibility", "visible");
        }

        function move_tooltip_to_cursor() {
            return tooltip
                .style("top", event.pageY - 230 + "px")
                .style("left", event.pageX + 20 + "px");
        }

        function hide_tooltip() {
            $(this).removeClass("ismouseover");
            return tooltip.style("visibility", "hidden");
        }

        /*
        Return the position of the given circle/triangle
        */
        function get_position(dp_element) {
            return [
                dp_element.transform.baseVal[0].matrix.e,
                dp_element.transform.baseVal[0].matrix.f,
            ];
        }

        function onclick(d) {
            $(".selected-dp")
                .removeClass("selected-dp")
                .attr("stroke", "#9299a1")
                .attr("stroke-width", "1px");
            filter_by_dp_attr(d);
            $(this)
                .attr("stroke", "red")
                .attr("stroke-width", "3px")
                .addClass("selected-dp");

            // Update importance and relations charts
            const similarities_sorted = Array.from(d.distances[0].entries()).sort(
                (a, b) => b[1] - a[1]
            );
            const support_dps = d.support_set.map((idx) => data[idx]);
            const closest_dp = support_dps[similarities_sorted[0][0]]; // closest dp

            if (closest_dp.ground_truth_label_idx != d.prediction_label_idx) {
                throw new Error();
            }
            let dp2;

            if (d.prediction == d.ground_truth) {
                dp2 = support_dps[similarities_sorted[1][0]]; // second closest dp
            } else {
                dp2 = support_dps.find(
                    (dp) => dp.ground_truth_label_idx == d.ground_truth_label_idx
                );
            }

            // Give summary of selected point
            const is_prediction_correct = d.prediction == d.ground_truth;
            const html = `<div>
                    <p><b>Text: </b> ${d.text}<p>
                    <p><b>Predicted</b> intent was <b>${d.prediction}</b> ${is_prediction_correct
                    ? `(<span style="color: green">correct</span>)`
                    : `(<span style="color: red">wrong</span>)`
                }
                        based on closest support example.
                    </p>
                    ${!is_prediction_correct
                    ? `<p><b>Ground-truth</b> intent is <b>${d.ground_truth}</b>.</p>`
                    : ""
                }
                    </div>

                    <hr>
                    <div>
                    <div><b>Closest support example: </b></div>
                    ${closest_dp.text}
                    (${closest_dp.ground_truth})
                    </div>

                    <hr>
                    <div>
                    <div><b>${is_prediction_correct
                    ? "Next closest example:"
                    : "Correct support example:"
                }</b></div>
                    ${dp2.text}
                    (${dp2.ground_truth})
                    </div>
                    
                    `;

            d3.select("#summary").html(html);

            // populate the relchart automatically
            loadingImportanceChart();
            emptyRelationChart();
            emptyTokenChart();

            updateRelationChart(d.idx, closest_dp.idx)
                .then((_) => updateRelationChart(d.idx, dp2.idx))
                .then((_) => updateImportanceChart(d))
                .then((_) => updateTokenChart(d.idx, closest_dp.idx))
                .then((_) => updateTokenChart(d.idx, dp2.idx));

            // draw the draglines to the two support examples
            const dragline0 = d3.select("#drag-line-0");
            const dragline1 = d3.select("#drag-line-1");

            dragline0
                .style("visibility", "visible")
                .attr("x1", newX(d[`${dim_reduction}-dim0`]))
                .attr("y1", newY(d[`${dim_reduction}-dim1`]))
                .attr("x2", newX(closest_dp[`${dim_reduction}-dim0`]))
                .attr("y2", newY(closest_dp[`${dim_reduction}-dim1`]))
                .data([
                    {
                        x1: d[`${dim_reduction}-dim0`],
                        y1: d[`${dim_reduction}-dim1`],
                        x2: closest_dp[`${dim_reduction}-dim0`],
                        y2: closest_dp[`${dim_reduction}-dim1`],
                    },
                ]);

            dragline1
                .style("visibility", "visible")
                .attr("x1", newX(d[`${dim_reduction}-dim0`]))
                .attr("y1", newY(d[`${dim_reduction}-dim1`]))
                .attr("x2", newX(dp2[`${dim_reduction}-dim0`]))
                .attr("y2", newY(dp2[`${dim_reduction}-dim1`]))
                .data([
                    {
                        x1: d[`${dim_reduction}-dim0`],
                        y1: d[`${dim_reduction}-dim1`],
                        x2: dp2[`${dim_reduction}-dim0`],
                        y2: dp2[`${dim_reduction}-dim1`],
                    },
                ]);
        }

        // Relation
        let relChart1;
        let relChart2;

        function emptyRelationChart() {
            d3.selectAll("svg#rel_chart > *").remove();
            d3.selectAll("svg#rel_chart_left > *").remove();
        }

        function emptyTokenChart() {
            d3.selectAll("svg#token_chart > *").remove();
            d3.selectAll("svg#token_chart_left > *").remove();
        }

        function updateRelationChart(idx1, idx2) {
            if (idx1 == idx2) return;

            const current_tokens1 = d3
                .selectAll("svg#rel_chart > .text_left")
                .data()
                .map((d) => d.token);

            const reltype = "integrad";

            return new Promise((resolve, reject) => {
                $.ajax(
                    `relation?dataset=${DATASET_NAME}&index1=${idx1}&index2=${idx2}&reltype=${reltype}`
                )
                    .done(function (res) {
                        const tokens1 = res.tokens1;
                        if (current_tokens1.join(" ") == tokens1.join(" ")) {
                            $("#rel_chart_left_container").animate({
                                width: RELCHART_LEFT_WIDTH + "px",
                            });
                            d3.selectAll("svg#rel_chart_left > *").remove();
                            renderSecondRelChart(res);
                        } else {
                            $("#rel_chart_left_container").animate({
                                width: "0px",
                            });
                            d3.selectAll("svg#rel_chart > *").remove();
                            renderRelChart(res);
                        }
                        resolve();
                    })
                    .fail(function () {
                        alert("There is an issue at the moment. Please try again soon.");
                        reject();
                    });
            });
        }

        function updateTokenChart(idx1, idx2) {
            if (idx1 == idx2) return;

            const current_tokens1 = d3
                .selectAll("svg#token_chart > .text_left")
                .data()
                .map((d) => d.token);

            const reltype = "token2token";

            return new Promise((resolve, reject) => {
                $.ajax(
                    `relation?dataset=${DATASET_NAME}&index1=${idx1}&index2=${idx2}&reltype=${reltype}`
                )
                    .done(function (res) {
                        const tokens1 = res.tokens1;
                        if (current_tokens1.join(" ") == tokens1.join(" ")) {
                            $("#token_chart_left_container").animate({
                                width: RELCHART_LEFT_WIDTH + "px",
                            });
                            d3.selectAll("svg#token_chart_left > *").remove();
                            renderSecondTokenChart(res);
                        } else {
                            $("#token_chart_left_container").animate({
                                width: "0px",
                            });
                            d3.selectAll("svg#token_chart > *").remove();
                            renderTokenChart(res);
                        }

                        resolve();
                    })
                    .fail(function () {
                        alert("There is an issue at the moment. Please try again soon.");
                        reject();
                    });
            });
        }

        function renderRelTexts(
            container_selector,
            data,
            all_importance,
            is_left_col,
            onMouseOver,
            onMouseOut
        ) {
            const fontsize = 13;
            const relchart = d3.select(container_selector);

            const chart_height = relchart.node().clientHeight;
            const chart_width = relchart.node().clientWidth;
            const spacing =
                (chart_height - data.length * fontsize) / (data.length - 1);

            const text_anchor = is_left_col ? "start" : "end";
            const text_class = "text" + (is_left_col ? "_left" : "_right");
            const rect_class = "rect" + (is_left_col ? "_left" : "_right");
            const text_x = is_left_col ? 0 : chart_width;
            const rect_opacity = (d) =>
                d.importance ? 0.5 * minmax(all_importance, Math.abs(d.importance)) : 0;

            let texts = relchart
                .selectAll("." + text_class)
                .data(data)
                .enter()
                .append("text")
                .attr("text-anchor", text_anchor)
                .attr("class", text_class)
                .text((d) => d.token)
                .style("font-size", fontsize + "px")
                .attr("x", text_x + "px")
                .attr("y", (d) => (d.pos + 1) * fontsize + d.pos * spacing);
            const bboxes = [];
            texts.each(function (d) {
                bboxes.push(this.getBBox());
            });
            relchart
                .selectAll("." + rect_class)
                .data(data)
                .enter()
                .append("rect")
                .attr("class", rect_class)
                .attr("width", (d) => bboxes[d.pos].width)
                .attr("height", (d) => bboxes[d.pos].height)
                .attr("x", (d) => bboxes[d.pos].x)
                .attr("y", (d) => bboxes[d.pos].y)
                .attr("fill", (d) => (d.importance > 0 ? "skyblue" : "pink"))
                .attr("fill-opacity", all_importance ? rect_opacity : 0);
            texts.remove();
            texts = relchart
                .selectAll("." + text_class)
                .data(data)
                .enter()
                .append("text")
                .attr("text-anchor", text_anchor)
                .attr("class", text_class)
                .text((d) => d.token)
                .style("font-size", fontsize + "px")
                .attr("x", text_x + "px")
                .attr("y", (d) => (d.pos + 1) * fontsize + d.pos * spacing)
                .style("fill", "black")
                .on("mouseover", onMouseOver || onMouseOverRelChart)
                .on("mouseout", onMouseOut || onMouseOutRelChart);
            return bboxes;
        }

        function renderRelChart(res) {
            // Draw texts
            const fontsize = 13;
            const relchart = d3.select("svg#rel_chart");
            const leftcol_data = res.tokens1.map((t, i) => ({
                token: t,
                pos: i,
                importance: res.importance1[i],
            }));
            const rightcol_data = res.tokens2.map((t, i) => ({
                token: t,
                pos: i,
                importance: res.importance2[i],
            }));

            const chart_height = relchart.node().clientHeight;
            const chart_width = relchart.node().clientWidth;
            const spacing_left_col =
                (chart_height - res.tokens1.length * fontsize) /
                (res.tokens1.length - 1);
            const spacing_right_col =
                (chart_height - res.tokens2.length * fontsize) /
                (res.tokens2.length - 1);
            const all_importance = res.importance1
                .concat(res.importance2)
                .map((i) => Math.abs(i));

            const left_text_bboxes = renderRelTexts(
                "svg#rel_chart",
                leftcol_data,
                all_importance,
                true,
                (d) => {
                    onMouseOverRelChart(d);
                    onMouseOverCenterTokenInTokenChart(d);
                }
            );
            const right_text_bboxes = renderRelTexts(
                "svg#rel_chart",
                rightcol_data,
                all_importance,
                false,
                (d) => {
                    onMouseOverRelChart(d);
                    onMouseOverRightTokenInTokenChart(d);
                }
            );

            // Draw links
            const getWidth = (d) =>
                10 * minmax(all_importance, Math.abs(d.importance));

            const pos_left = leftcol_data
                .filter((dp) => dp.importance > 0)
                .map(getWidth);
            const neg_left = leftcol_data
                .filter((dp) => dp.importance < 0)
                .map(getWidth);
            const pos_right = rightcol_data
                .filter((dp) => dp.importance > 0)
                .map(getWidth);
            const neg_right = rightcol_data
                .filter((dp) => dp.importance < 0)
                .map(getWidth);

            const max_pos =
                pos_left.reduce((a, b) => a + b, 0) >
                    pos_right.reduce((a, b) => a + b, 0)
                    ? pos_left
                    : pos_right;
            const max_neg =
                neg_left.reduce((a, b) => a + b, 0) >
                    neg_right.reduce((a, b) => a + b, 0)
                    ? neg_left
                    : neg_right;
            const total_width = max_pos.concat(max_neg).reduce((a, b) => a + b, 0);

            const PAD = 0;
            const start_line_pos = chart_height / 2 - total_width / 2;
            const start_line_neg =
                PAD +
                chart_height / 2 +
                total_width / 2 -
                max_neg.reduce((a, b) => a + b, 0);

            let linkGenerator = d3
                .linkHorizontal()
                .x((d) => d.x)
                .y((d) => d.y);

            const left_lines = relchart
                .selectAll(".left_links")
                .data(
                    leftcol_data
                        .filter((dp) => !isNaN(dp.importance))
                        .map(function (d, i) {
                            const positives_so_far_sum = leftcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance > 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);
                            const negatives_so_far_sum = leftcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance < 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);

                            const y_start_line =
                                d.importance > 0 ? start_line_pos : start_line_neg;
                            const y_offset =
                                d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                            return {
                                pos: i,
                                source: {
                                    x: Math.max(...left_text_bboxes.map((b) => b.width)) + 5,
                                    y: (d.pos + 1) * fontsize + d.pos * spacing_left_col,
                                },
                                target: {
                                    x: chart_width / 2,
                                    y: y_start_line + y_offset + getWidth(d) / 2,
                                },
                                importance: d.importance,
                            };
                        })
                )
                .enter()
                .append("path")
                .attr("d", linkGenerator)
                .attr("class", "left_links rel_link")
                .attr("fill", "none")
                .style("stroke", (d) => (d.importance > 0 ? "skyblue" : "pink"))
                .style("stroke-width", (d) =>
                    d.importance ? 10 * minmax(all_importance, Math.abs(d.importance)) : 0
                )
                .style(
                    "stroke-opacity",
                    (d) => 0.2 + 0.8 * minmax(all_importance, Math.abs(d.importance))
                );

            const right_lines = relchart
                .selectAll(".right_links")
                .data(
                    rightcol_data
                        .filter((dp) => !isNaN(dp.importance))
                        .map(function (d, i) {
                            const positives_so_far_sum = rightcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance > 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);
                            const negatives_so_far_sum = rightcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance < 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);

                            const y_start_line =
                                d.importance > 0 ? start_line_pos : start_line_neg;
                            const y_offset =
                                d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                            return {
                                pos: i,
                                source: {
                                    x: chart_width / 2,
                                    y: y_start_line + y_offset + getWidth(d) / 2,
                                },
                                target: {
                                    x:
                                        chart_width -
                                        (Math.max(...right_text_bboxes.map((b) => b.width)) + 5),
                                    y: (d.pos + 1) * fontsize + d.pos * spacing_right_col,
                                },
                                importance: d.importance,
                            };
                        })
                )
                .enter()
                .append("path")
                .attr("d", linkGenerator)
                .attr("class", "right_links rel_link")
                .attr("fill", "none")
                .style("stroke", (d) => (d.importance > 0 ? "skyblue" : "pink"))
                .style("stroke-width", (d) =>
                    d.importance ? 10 * minmax(all_importance, Math.abs(d.importance)) : 0
                )
                .style(
                    "stroke-opacity",
                    (d) => 0.2 + 0.8 * minmax(all_importance, Math.abs(d.importance))
                );

            // Add 2 similarity blocks
            const block_width = 10;
            relchart
                .selectAll(".sim_block")
                .data([
                    {
                        sign: 1,
                        fill: "skyblue",
                        stroke: "blue",
                        height: max_pos.reduce((a, b) => a + b, 0),
                        y: start_line_pos,
                    },
                    {
                        sign: -1,
                        fill: "pink",
                        stroke: "red",
                        height: max_neg.reduce((a, b) => a + b, 0),
                        y: start_line_neg,
                    },
                ])
                .enter()
                .append("rect")
                .attr("fill", (d) => d.fill)
                .attr("stroke", (d) => d.stroke)
                .attr("x", chart_width / 2 - block_width / 2)
                .attr("y", (d) => d.y)
                .attr("height", (d) => d.height)
                .attr("width", block_width)
                .on("mouseover", function (d) {
                    d3.selectAll(".rel_link")
                        .filter((dp) => dp.importance > 0 != d.sign > 0)
                        .style("visibility", "hidden");

                    d3.select("#rel_chart_tooltip")
                        .style("visibility", "visible")
                        .html(
                            `Total ${d.sign > 0 ? "positive" : "negative"} gradients:
                    ${d.sign > 0
                                ? leftcol_data
                                    .map((dp) => dp.importance)
                                    .filter((imp) => imp > 0)
                                    .concat(
                                        rightcol_data
                                            .map((dp) => dp.importance)
                                            .filter((imp) => imp > 0)
                                    )
                                    .reduce((a, b) => a + b, 0)
                                    .toFixed(1)
                                : leftcol_data
                                    .map((dp) => dp.importance)
                                    .filter((imp) => imp < 0)
                                    .concat(
                                        rightcol_data
                                            .map((dp) => dp.importance)
                                            .filter((imp) => imp < 0)
                                    )
                                    .reduce((a, b) => a + b, 0)
                                    .toFixed(1)
                            }`
                        )
                        .style("top", event.pageY + 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function (d) {
                    d3.selectAll(".rel_link")
                        .filter((dp) => dp.importance > 0 != d.sign > 0)
                        .style("visibility", "visible");
                });

            d3.selectAll(".rel_link")
                .on("mouseover", function (d) {
                    d3.select("#rel_chart_tooltip")
                        .style("visibility", "visible")
                        .html(
                            `Importance (integrated gradient): ${d.importance.toFixed(3)}`
                        )
                        .style("top", event.pageY + 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function (d) {
                    d3.select("#rel_chart_tooltip").style("visibility", "hidden");
                });
        }

        function renderSecondRelChart(res) {
            // Draw text
            const fontsize = 13;
            const relchart_left = d3.select("svg#rel_chart_left");
            const chart_height = relchart_left.node().clientHeight;
            const spacing_left_col =
                (chart_height - res.tokens2.length * fontsize) /
                (res.tokens2.length - 1);
            const spacing_right_col =
                (chart_height - res.tokens1.length * fontsize) /
                (res.tokens1.length - 1);

            const rightcol_data = res.tokens1.map((t, i) => ({
                token: t,
                pos: i,
                importance: res.importance1[i],
            }));
            const leftcol_data = res.tokens2.map((t, i) => ({
                token: t,
                pos: i,
                importance: res.importance2[i],
            }));

            const importance3 = d3
                .selectAll("svg#rel_chart > .text_right")
                .data()
                .map((d) => d.importance);
            const importance4 = d3
                .selectAll("svg#rel_chart > .text_left")
                .data()
                .map((d) => d.importance);
            const all_importance = res.importance1
                .concat(res.importance2)
                .concat(importance3)
                .concat(importance4)
                .map((i) => Math.abs(i));

            const left_text_bboxes = renderRelTexts(
                "svg#rel_chart_left",
                leftcol_data,
                all_importance,
                true,
                (d) => {
                    onMouseOverRelChart(d);
                    onMouseOverLeftTokenInTokenChart(d);
                }
            );

            // Render links
            const getWidth = (d) =>
                10 * minmax(all_importance, Math.abs(d.importance));

            const pos_left = leftcol_data
                .filter((dp) => dp.importance > 0)
                .map(getWidth);
            const neg_left = leftcol_data
                .filter((dp) => dp.importance < 0)
                .map(getWidth);
            const pos_right = rightcol_data
                .filter((dp) => dp.importance > 0)
                .map(getWidth);
            const neg_right = rightcol_data
                .filter((dp) => dp.importance < 0)
                .map(getWidth);

            const max_pos =
                pos_left.reduce((a, b) => a + b, 0) >
                    pos_right.reduce((a, b) => a + b, 0)
                    ? pos_left
                    : pos_right;
            const max_neg =
                neg_left.reduce((a, b) => a + b, 0) >
                    neg_right.reduce((a, b) => a + b, 0)
                    ? neg_left
                    : neg_right;
            const total_width = max_pos.concat(max_neg).reduce((a, b) => a + b, 0);

            const PAD = 0;
            const start_line_pos = chart_height / 2 - total_width / 2;
            const start_line_neg =
                PAD +
                chart_height / 2 +
                total_width / 2 -
                max_neg.reduce((a, b) => a + b, 0);

            let linkGenerator = d3
                .linkHorizontal()
                .x((d) => d.x)
                .y((d) => d.y);

            const chart_width = RELCHART_LEFT_WIDTH;
            const left_lines = relchart_left
                .selectAll(".left_links_contrast")
                .data(
                    leftcol_data
                        .filter((dp) => !isNaN(dp.importance))
                        .map(function (d, i) {
                            const positives_so_far_sum = leftcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance > 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);
                            const negatives_so_far_sum = leftcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance < 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);

                            const y_start_line =
                                d.importance > 0 ? start_line_pos : start_line_neg;
                            const y_offset =
                                d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                            return {
                                source: {
                                    x: Math.max(...left_text_bboxes.map((b) => b.width)) + 5,
                                    y: (d.pos + 1) * fontsize + d.pos * spacing_left_col,
                                },
                                target: {
                                    x: chart_width / 2,
                                    y: y_start_line + y_offset + getWidth(d) / 2,
                                },
                                importance: d.importance,
                            };
                        })
                )
                .enter()
                .append("path")
                .attr("fill", "none")
                .attr("d", linkGenerator)
                .attr("class", "rel_link left_links_contrast")
                .style("stroke", (d) => (d.importance > 0 ? "skyblue" : "pink"))
                .style("stroke-width", (d) =>
                    d.importance ? 10 * minmax(all_importance, Math.abs(d.importance)) : 0
                )
                .style(
                    "stroke-opacity",
                    (d) => 0.2 + 0.8 * minmax(all_importance, Math.abs(d.importance))
                );

            const right_lines = relchart_left
                .selectAll(".right_links_contrast")
                .data(
                    rightcol_data
                        .filter((dp) => !isNaN(dp.importance))
                        .map(function (d, i) {
                            const positives_so_far_sum = rightcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance > 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);
                            const negatives_so_far_sum = rightcol_data
                                .slice(0, i)
                                .filter((dp) => dp.importance < 0)
                                .map(getWidth)
                                .reduce((a, b) => a + b, 0);

                            const y_start_line =
                                d.importance > 0 ? start_line_pos : start_line_neg;
                            const y_offset =
                                d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                            return {
                                source: {
                                    x: chart_width / 2,
                                    y: y_start_line + y_offset + getWidth(d) / 2,
                                },
                                target: {
                                    x: chart_width * 0.9,
                                    y: (d.pos + 1) * fontsize + d.pos * spacing_right_col,
                                },
                                importance: d.importance,
                            };
                        })
                )
                .enter()
                .append("path")
                .attr("fill", "none")
                .attr("d", linkGenerator)
                .attr("class", "rel_link right_links_contrast")
                .style("stroke", (d) => (d.importance > 0 ? "skyblue" : "pink"))
                .style("stroke-width", (d) =>
                    d.importance ? 10 * minmax(all_importance, Math.abs(d.importance)) : 0
                )
                .style(
                    "stroke-opacity",
                    (d) => 0.2 + 0.8 * minmax(all_importance, Math.abs(d.importance))
                );

            // Add 2 similarity blocks
            const block_width = 10;
            relchart_left
                .selectAll(".sim_block")
                .data([
                    {
                        sign: 1,
                        fill: "skyblue",
                        stroke: "blue",
                        height: max_pos.reduce((a, b) => a + b, 0),
                        y: start_line_pos,
                    },
                    {
                        sign: -1,
                        fill: "pink",
                        stroke: "red",
                        height: max_neg.reduce((a, b) => a + b, 0),
                        y: start_line_neg,
                    },
                ])
                .enter()
                .append("rect")
                .attr("fill", (d) => d.fill)
                .attr("stroke", (d) => d.stroke)
                .attr("x", chart_width / 2 - block_width / 2)
                .attr("y", (d) => d.y)
                .attr("height", (d) => d.height)
                .attr("width", block_width)
                .on("mouseover", function (d) {
                    d3.selectAll(".rel_link")
                        .filter((dp) => dp.importance > 0 != d.sign > 0)
                        .style("visibility", "hidden");

                    d3.select("#rel_chart_tooltip")
                        .style("visibility", "visible")
                        .html(
                            `Total ${d.sign > 0 ? "positive" : "negative"} gradients:
                    ${d.sign > 0
                                ? leftcol_data
                                    .map((dp) => dp.importance)
                                    .filter((imp) => imp > 0)
                                    .concat(
                                        rightcol_data
                                            .map((dp) => dp.importance)
                                            .filter((imp) => imp > 0)
                                    )
                                    .reduce((a, b) => a + b, 0)
                                    .toFixed(1)
                                : leftcol_data
                                    .map((dp) => dp.importance)
                                    .filter((imp) => imp < 0)
                                    .concat(
                                        rightcol_data
                                            .map((dp) => dp.importance)
                                            .filter((imp) => imp < 0)
                                    )
                                    .reduce((a, b) => a + b, 0)
                                    .toFixed(1)
                            }`
                        )
                        .style("top", event.pageY + 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function (d) {
                    d3.selectAll(".rel_link")
                        .filter((dp) => dp.importance > 0 != d.sign > 0)
                        .style("visibility", "visible");
                });

            // Recalculate stroke opacity for previously visible lines
            d3.selectAll(".left_links").style(
                "stroke-opacity",
                (d) => 0.2 + 0.8 * minmax(all_importance, Math.abs(d.importance))
            );
            d3.selectAll(".right_links").style(
                "stroke-opacity",
                (d) => 0.2 + 0.8 * minmax(all_importance, Math.abs(d.importance))
            );

            // Similarly, recalculate opacity of previously visible highlight rects
            const relchart = d3.select("svg#rel_chart");

            relchart
                .selectAll(".right_rect")
                .attr("fill-opacity", (d) =>
                    d.importance
                        ? 0.5 * minmax(all_importance, Math.abs(d.importance))
                        : 0
                );
            // For the middle texts, highlight by contrastiveness
            const contrastiveness_scores = res.importance1
                .map((s, i) => Math.abs(s - importance4[i]))
                .filter((s) => !isNaN(s));
            const distinguishing_factor_idx = contrastiveness_scores.indexOf(
                Math.max(...contrastiveness_scores)
            );

            relchart
                .selectAll(".rect_left")
                .attr("fill", "yellow")
                .attr("fill-opacity", (d) =>
                    distinguishing_factor_idx == d.pos ? 1 : 0
                );

            // Show importance value of link on hover
            d3.selectAll(".rel_link")
                .on("mouseover", function (d) {
                    d3.select("#rel_chart_tooltip")
                        .style("visibility", "visible")
                        .html(
                            `Importance (integrated gradient): ${d.importance ? d.importance.toFixed(3) : ""
                            }`
                        )
                        .style("top", event.pageY + 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function (d) {
                    d3.select("#rel_chart_tooltip").style("visibility", "hidden");
                });
        }

        function onMouseOverRelChart(d) {
            const tooltip = d3.select("#rel_chart_tooltip");
            if (d.importance) {
                tooltip
                    .style("visibility", "visible")
                    .html(
                        `Importance of token "${d.token
                        }" (integrated gradient): ${d.importance.toFixed(3)}`
                    )
                    .style("top", event.pageY + 10 + "px")
                    .style("left", event.pageX + 10 + "px");
            }
        }

        function onMouseOutRelChart(d) {
            d3.select("#rel_chart_tooltip").style("visibility", "hidden");
            onMouseOutInTokenChart(d);
        }

        function onMouseOverCenterTokenInTokenChart(d) {
            d3.selectAll(".token_links")
                .filter((l) => l.from != d.pos)
                .style("visibility", "hidden");
            d3.selectAll(".token_links_contrast")
                .filter((l) => l.to != d.pos)
                .style("visibility", "hidden");
        }

        function onMouseOverRightTokenInTokenChart(d) {
            d3.selectAll(".token_links")
                .filter((l) => l.to != d.pos)
                .style("visibility", "hidden");
            d3.selectAll(".token_links_contrast").style("visibility", "hidden");
        }

        function onMouseOverLeftTokenInTokenChart(d) {
            d3.selectAll(".token_links_contrast")
                .filter((l) => l.from != d.pos)
                .style("visibility", "hidden");
            d3.selectAll(".token_links").style("visibility", "hidden");
        }

        function onMouseOutInTokenChart(d) {
            d3.selectAll(".token_links, .token_links_contrast").style(
                "visibility",
                "visible"
            );
        }

        function renderTokenChart(res) {
            // Draw texts
            const fontsize = 13;
            const tokenchart = d3.select("svg#token_chart");
            const leftcol_data = res.tokens1.map((t, i) => ({
                token: t,
                pos: i,
                is_left: true,
            }));
            const rightcol_data = res.tokens2.map((t, i) => ({
                token: t,
                pos: i,
                is_left: false,
            }));

            const chart_height = tokenchart.node().clientHeight;
            const chart_width = tokenchart.node().clientWidth;
            const spacing_left_col =
                (chart_height - res.tokens1.length * fontsize) /
                (res.tokens1.length - 1);
            const spacing_right_col =
                (chart_height - res.tokens2.length * fontsize) /
                (res.tokens2.length - 1);

            let onMouseOver = function (d) {
                if (d.is_left) {
                    onMouseOverCenterTokenInTokenChart(d);
                } else {
                    onMouseOverRightTokenInTokenChart(d);
                }
            };

            const left_text_bboxes = renderRelTexts(
                "svg#token_chart",
                leftcol_data,
                null,
                true,
                onMouseOver,
                onMouseOutInTokenChart
            );
            const right_text_bboxes = renderRelTexts(
                "svg#token_chart",
                rightcol_data,
                null,
                false,
                onMouseOver,
                onMouseOutInTokenChart
            );

            // Draw links
            const link_data = [];
            res.links.forEach(function (links, i) {
                links.forEach(function (link, j) {
                    link_data.push({ from: i, to: j, strength: link });
                });
            });
            const old_links_data = d3.selectAll(".token_links").data();
            const all_link_strengths = link_data
                .concat(old_links_data)
                .map((l) => l.strength);

            tokenchart
                .selectAll(".token_links")
                .data(link_data)
                .enter()
                .append("line")
                .attr("class", "token_links")
                .attr("x1", Math.max(...left_text_bboxes.map((b) => b.width)) + 5)
                .attr("y1", (d) => (d.from + 1) * fontsize + d.from * spacing_left_col)
                .attr(
                    "x2",
                    chart_width - (Math.max(...right_text_bboxes.map((b) => b.width)) + 5)
                )
                .attr("y2", (d) => (d.to + 1) * fontsize + d.to * spacing_right_col)
                .style("stroke", "lightblue")
                .style(
                    "stroke-width",
                    (d) => 10 * minmax(all_link_strengths, Math.abs(d.strength)) ** 3
                )
                .style(
                    "stroke-opacity",
                    (d) => minmax(all_link_strengths, Math.abs(d.strength)) ** 3
                );
        }

        function renderSecondTokenChart(res) {
            // Draw text
            const fontsize = 13;
            const tokenchart_left = d3.select("svg#token_chart_left");
            const chart_height = tokenchart_left.node().clientHeight;
            const spacing_left_col =
                (chart_height - res.tokens2.length * fontsize) /
                (res.tokens2.length - 1);
            const spacing_right_col =
                (chart_height - res.tokens1.length * fontsize) /
                (res.tokens1.length - 1);

            const rightcol_data = res.tokens1.map((t, i) => ({ token: t, pos: i }));
            const leftcol_data = res.tokens2.map((t, i) => ({ token: t, pos: i }));

            const left_text_bboxes = renderRelTexts(
                "svg#token_chart_left",
                leftcol_data,
                null,
                true,
                onMouseOverLeftTokenInTokenChart,
                onMouseOutInTokenChart
            );

            // Draw links
            const link_data = [];
            res.links.forEach(function (links, i) {
                links.forEach(function (link, j) {
                    link_data.push({ from: j, to: i, strength: link });
                });
            });
            const old_links_data = d3.selectAll(".token_links").data();
            const all_link_strengths = link_data
                .concat(old_links_data)
                .map((l) => l.strength);

            tokenchart_left
                .selectAll(".token_links_contrast")
                .data(link_data)
                .enter()
                .append("line")
                .attr("class", "token_links_contrast")
                .attr("x1", Math.max(...left_text_bboxes.map((b) => b.width)) + 5)
                .attr("y1", (d) => (d.from + 1) * fontsize + d.from * spacing_left_col)
                .attr("x2", "95%")
                .attr("y2", (d) => (d.to + 1) * fontsize + d.to * spacing_right_col)
                .style("stroke", "lightblue")
                .style(
                    "stroke-width",
                    (d) => 10 * minmax(all_link_strengths, Math.abs(d.strength)) ** 3
                )
                .style(
                    "stroke-opacity",
                    (d) => minmax(all_link_strengths, Math.abs(d.strength)) ** 3
                );

            d3.selectAll(".token_links, .token_links_contrast")
                .on("mouseover", function (d) {
                    d3.select("#rel_chart_tooltip")
                        .style("visibility", "visible")
                        .html(`Similarity (inner product): ${d.strength.toFixed(3)}`)
                        .style("top", event.pageY + 10 + "px")
                        .style("left", event.pageX + 10 + "px");
                })
                .on("mouseout", function (d) {
                    d3.select("#rel_chart_tooltip").style("visibility", "hidden");
                });
        }

        function sum(values) {
            return values.reduce((a, b) => a + b, 0);
        }

        function softmax(values) {
            const val_exps = values.map((val) => Math.exp(val));
            const exps_sum = val_exps.reduce((a, b) => a + b, 0);
            return val_exps.map((val) => val / exps_sum);
        }

        function minmax(values, value) {
            if (value && !values.includes(value)) {
                throw new Error("value must be included in values");
            }

            values = values.filter((v) => !isNaN(v));
            const max_val = Math.max(...values);
            const min_val = Math.min(...values);
            const val_range = max_val - min_val;

            if (value) {
                return (value - min_val) / val_range;
            } else {
                return values.map((val) => (value - min_val) / val_range);
            }
        }

        // Importance
        let importanceChart;
        const dummyChartData = {
            labels: ["*", "*", "*", "*", "*", "*", "*"],
            datasets: [
                {
                    label: "*****",
                    borderColor: "lightgrey",
                    backgroundColor: "lightgrey",
                },
                {
                    label: "*****",
                    borderColor: "lightgrey",
                    backgroundColor: "lightgrey",
                },
                {
                    label: "*****",
                    borderColor: "lightgrey",
                    backgroundColor: "lightgrey",
                },
            ],
        };

        function loadingImportanceChart() {
            if (importanceChart) importanceChart.destroy();
            importanceChart = createImportanceChart(
                "importance_chart",
                dummyChartData
            );
        }

        function updateImportanceChart(d) {
            return new Promise((resolve, reject) => {
                $.ajax(`importances?dataset=${DATASET_NAME}&index=${d.idx}`)
                    .done(function (res) {
                        const importanceData = formatImportanceData(res);
                        if (importanceChart) importanceChart.destroy();
                        importanceChart = createImportanceChart(
                            "importance_chart",
                            importanceData
                        );
                        resolve();
                    })
                    .fail(function () {
                        alert("error");
                        reject();
                    });
            });
        }

        function createImportanceChart(container_id, data) {
            const ctx = document.getElementById(container_id);

            const config = {
                type: "bar",
                data: data,
                options: {
                    categoryPercentage: 0.9,
                    barPercentage: 1,
                    maintainAspectRatio: false,
                    indexAxis: "y",
                    // Elements options apply to all of the options unless overridden in a dataset
                    // In this case, we are setting the border of each horizontal bar to be 2px wide
                    elements: {
                        bar: {
                            borderWidth: 1,
                        },
                    },
                    responsive: true,
                    plugins: {
                        legend: {
                            position: "bottom",
                        },
                    },
                    scales: {
                        x: {
                            stacked: true,
                        },
                        y: {
                            stacked: true,
                            ticks: {
                                autoSkip: false,
                            },
                        },
                    },
                },
            };
            return new Chart(ctx, config);
        }

        function formatImportanceData(res) {
            const integrad_abs = res.integrad_importance.map((x) => Math.abs(x));
            const lime_abs = res.lime_importance.map((x) => Math.abs(x));
            const grad_abs = res.grad_importance.map((x) => Math.abs(x));

            const data = {
                labels: res.tokens,
                datasets: [
                    {
                        label: "Attention",
                        data: res.attn_importance.map(
                            (x) => x / Math.max(...res.attn_importance)
                        ),
                        borderColor: "white",
                        borderWidth: 2,
                        backgroundColor: "#0072b2",
                    },
                    {
                        label: "Integrated Gradient",
                        data: integrad_abs.map((x) => x / Math.max(...integrad_abs)),
                        borderColor: "white",
                        borderWidth: 2,
                        backgroundColor: "#e69f00",
                    },
                    {
                        label: "Gradient",
                        data: grad_abs.map((x) => x / Math.max(...grad_abs)),
                        borderColor: "white",
                        borderWidth: 2,
                        backgroundColor: "#009E73",
                    },
                    {
                        label: "LIME",
                        data: lime_abs.map((x) => x / Math.max(...lime_abs)),
                        borderColor: "white",
                        borderWidth: 2,
                        backgroundColor: "#56B4E9",
                    },
                ],
            };

            return data;
        }

        function filter_by_dp_attr(d) {
            if (!d) {
                return;
            }

            const filter_by = $('input[name="filter-by"]:checked').val();
            let idxs = [];
            if (filter_by == "support_set") {
                idxs = d[filter_by].concat([d["idx"]]);
            } else {
                data.forEach(function (dp, i) {
                    if (dp[filter_by] == d[filter_by]) {
                        idxs.push(i);
                    }
                });
            }
            filterChart(idxs);
            updateSymbols();
            filterHulls([]);
        }

        function get_stopwords() {
            return [
                "0o",
                "0s",
                "3a",
                "3b",
                "3d",
                "6b",
                "6o",
                "a",
                "a1",
                "a2",
                "a3",
                "a4",
                "ab",
                "able",
                "about",
                "above",
                "abst",
                "ac",
                "accordance",
                "according",
                "accordingly",
                "across",
                "act",
                "actually",
                "ad",
                "added",
                "adj",
                "ae",
                "af",
                "affected",
                "affecting",
                "affects",
                "after",
                "afterwards",
                "ag",
                "again",
                "against",
                "ah",
                "ain",
                "ain't",
                "aj",
                "al",
                "all",
                "allow",
                "allows",
                "almost",
                "alone",
                "along",
                "already",
                "also",
                "although",
                "always",
                "am",
                "among",
                "amongst",
                "amoungst",
                "amount",
                "an",
                "and",
                "announce",
                "another",
                "any",
                "anybody",
                "anyhow",
                "anymore",
                "anyone",
                "anything",
                "anyway",
                "anyways",
                "anywhere",
                "ao",
                "ap",
                "apart",
                "apparently",
                "appear",
                "appreciate",
                "appropriate",
                "approximately",
                "ar",
                "are",
                "aren",
                "arent",
                "aren't",
                "arise",
                "around",
                "as",
                "a's",
                "aside",
                "ask",
                "asking",
                "associated",
                "at",
                "au",
                "auth",
                "av",
                "available",
                "aw",
                "away",
                "awfully",
                "ax",
                "ay",
                "az",
                "b",
                "b1",
                "b2",
                "b3",
                "ba",
                "back",
                "bc",
                "bd",
                "be",
                "became",
                "because",
                "become",
                "becomes",
                "becoming",
                "been",
                "before",
                "beforehand",
                "begin",
                "beginning",
                "beginnings",
                "begins",
                "behind",
                "being",
                "believe",
                "below",
                "beside",
                "besides",
                "best",
                "better",
                "between",
                "beyond",
                "bi",
                "bill",
                "biol",
                "bj",
                "bk",
                "bl",
                "bn",
                "both",
                "bottom",
                "bp",
                "br",
                "brief",
                "briefly",
                "bs",
                "bt",
                "bu",
                "but",
                "bx",
                "by",
                "c",
                "c1",
                "c2",
                "c3",
                "ca",
                "call",
                "came",
                "can",
                "cannot",
                "cant",
                "can't",
                "cause",
                "causes",
                "cc",
                "cd",
                "ce",
                "certain",
                "certainly",
                "cf",
                "cg",
                "ch",
                "changes",
                "ci",
                "cit",
                "cj",
                "cl",
                "clearly",
                "cm",
                "c'mon",
                "cn",
                "co",
                "com",
                "come",
                "comes",
                "con",
                "concerning",
                "consequently",
                "consider",
                "considering",
                "contain",
                "containing",
                "contains",
                "corresponding",
                "could",
                "couldn",
                "couldnt",
                "couldn't",
                "course",
                "cp",
                "cq",
                "cr",
                "cry",
                "cs",
                "c's",
                "ct",
                "cu",
                "currently",
                "cv",
                "cx",
                "cy",
                "cz",
                "d",
                "d2",
                "da",
                "date",
                "dc",
                "dd",
                "de",
                "definitely",
                "describe",
                "described",
                "despite",
                "detail",
                "df",
                "di",
                "did",
                "didn",
                "didn't",
                "different",
                "dj",
                "dk",
                "dl",
                "do",
                "does",
                "doesn",
                "doesn't",
                "doing",
                "don",
                "done",
                "don't",
                "down",
                "downwards",
                "dp",
                "dr",
                "ds",
                "dt",
                "du",
                "due",
                "during",
                "dx",
                "dy",
                "e",
                "e2",
                "e3",
                "ea",
                "each",
                "ec",
                "ed",
                "edu",
                "ee",
                "ef",
                "effect",
                "eg",
                "ei",
                "eight",
                "eighty",
                "either",
                "ej",
                "el",
                "eleven",
                "else",
                "elsewhere",
                "em",
                "empty",
                "en",
                "end",
                "ending",
                "enough",
                "entirely",
                "eo",
                "ep",
                "eq",
                "er",
                "es",
                "especially",
                "est",
                "et",
                "et-al",
                "etc",
                "eu",
                "ev",
                "even",
                "ever",
                "every",
                "everybody",
                "everyone",
                "everything",
                "everywhere",
                "ex",
                "exactly",
                "example",
                "except",
                "ey",
                "f",
                "f2",
                "fa",
                "far",
                "fc",
                "few",
                "ff",
                "fi",
                "fifteen",
                "fifth",
                "fify",
                "fill",
                "find",
                "fire",
                "first",
                "five",
                "fix",
                "fj",
                "fl",
                "fn",
                "fo",
                "followed",
                "following",
                "follows",
                "for",
                "former",
                "formerly",
                "forth",
                "forty",
                "found",
                "four",
                "fr",
                "from",
                "front",
                "fs",
                "ft",
                "fu",
                "full",
                "further",
                "furthermore",
                "fy",
                "g",
                "ga",
                "gave",
                "ge",
                "get",
                "gets",
                "getting",
                "gi",
                "give",
                "given",
                "gives",
                "giving",
                "gj",
                "gl",
                "go",
                "goes",
                "going",
                "gone",
                "got",
                "gotten",
                "gr",
                "greetings",
                "gs",
                "gy",
                "h",
                "h2",
                "h3",
                "had",
                "hadn",
                "hadn't",
                "happens",
                "hardly",
                "has",
                "hasn",
                "hasnt",
                "hasn't",
                "have",
                "haven",
                "haven't",
                "having",
                "he",
                "hed",
                "he'd",
                "he'll",
                "hello",
                "help",
                "hence",
                "her",
                "here",
                "hereafter",
                "hereby",
                "herein",
                "heres",
                "here's",
                "hereupon",
                "hers",
                "herself",
                "hes",
                "he's",
                "hh",
                "hi",
                "hid",
                "him",
                "himself",
                "his",
                "hither",
                "hj",
                "ho",
                "home",
                "hopefully",
                "how",
                "howbeit",
                "however",
                "how's",
                "hr",
                "hs",
                "http",
                "hu",
                "hundred",
                "hy",
                "i",
                "i2",
                "i3",
                "i4",
                "i6",
                "i7",
                "i8",
                "ia",
                "ib",
                "ibid",
                "ic",
                "id",
                "i'd",
                "ie",
                "if",
                "ig",
                "ignored",
                "ih",
                "ii",
                "ij",
                "il",
                "i'll",
                "im",
                "i'm",
                "immediate",
                "immediately",
                "importance",
                "important",
                "in",
                "inasmuch",
                "inc",
                "indeed",
                "index",
                "indicate",
                "indicated",
                "indicates",
                "information",
                "inner",
                "insofar",
                "instead",
                "interest",
                "into",
                "invention",
                "inward",
                "io",
                "ip",
                "iq",
                "ir",
                "is",
                "isn",
                "isn't",
                "it",
                "itd",
                "it'd",
                "it'll",
                "its",
                "it's",
                "itself",
                "iv",
                "i've",
                "ix",
                "iy",
                "iz",
                "j",
                "jj",
                "jr",
                "js",
                "jt",
                "ju",
                "just",
                "k",
                "ke",
                "keep",
                "keeps",
                "kept",
                "kg",
                "kj",
                "km",
                "know",
                "known",
                "knows",
                "ko",
                "l",
                "l2",
                "la",
                "largely",
                "last",
                "lately",
                "later",
                "latter",
                "latterly",
                "lb",
                "lc",
                "le",
                "least",
                "les",
                "less",
                "lest",
                "let",
                "lets",
                "let's",
                "lf",
                "like",
                "liked",
                "likely",
                "line",
                "little",
                "lj",
                "ll",
                "ll",
                "ln",
                "lo",
                "look",
                "looking",
                "looks",
                "los",
                "lr",
                "ls",
                "lt",
                "ltd",
                "m",
                "m2",
                "ma",
                "made",
                "mainly",
                "make",
                "makes",
                "many",
                "may",
                "maybe",
                "me",
                "mean",
                "means",
                "meantime",
                "meanwhile",
                "merely",
                "mg",
                "might",
                "mightn",
                "mightn't",
                "mill",
                "million",
                "mine",
                "miss",
                "ml",
                "mn",
                "mo",
                "more",
                "moreover",
                "most",
                "mostly",
                "move",
                "mr",
                "mrs",
                "ms",
                "mt",
                "mu",
                "much",
                "mug",
                "must",
                "mustn",
                "mustn't",
                "my",
                "myself",
                "n",
                "n2",
                "na",
                "name",
                "namely",
                "nay",
                "nc",
                "nd",
                "ne",
                "near",
                "nearly",
                "necessarily",
                "necessary",
                "need",
                "needn",
                "needn't",
                "needs",
                "neither",
                "never",
                "nevertheless",
                "next",
                "ng",
                "ni",
                "nine",
                "ninety",
                "nj",
                "nl",
                "nn",
                "no",
                "nobody",
                "non",
                "none",
                "nonetheless",
                "noone",
                "nor",
                "normally",
                "nos",
                "not",
                "noted",
                "nothing",
                "novel",
                "now",
                "nowhere",
                "nr",
                "ns",
                "nt",
                "ny",
                "o",
                "oa",
                "ob",
                "obtain",
                "obtained",
                "obviously",
                "oc",
                "od",
                "of",
                "off",
                "often",
                "og",
                "oh",
                "oi",
                "oj",
                "ok",
                "okay",
                "ol",
                "old",
                "om",
                "omitted",
                "on",
                "once",
                "one",
                "ones",
                "only",
                "onto",
                "oo",
                "op",
                "oq",
                "or",
                "ord",
                "os",
                "ot",
                "other",
                "others",
                "otherwise",
                "ou",
                "ought",
                "our",
                "ours",
                "ourselves",
                "out",
                "outside",
                "over",
                "overall",
                "ow",
                "owing",
                "own",
                "ox",
                "oz",
                "p",
                "p1",
                "p2",
                "p3",
                "page",
                "pagecount",
                "pages",
                "par",
                "part",
                "particular",
                "particularly",
                "pas",
                "past",
                "pc",
                "pd",
                "pe",
                "per",
                "perhaps",
                "pf",
                "ph",
                "pi",
                "pj",
                "pk",
                "pl",
                "placed",
                "please",
                "plus",
                "pm",
                "pn",
                "po",
                "poorly",
                "possible",
                "possibly",
                "potentially",
                "pp",
                "pq",
                "pr",
                "predominantly",
                "present",
                "presumably",
                "previously",
                "primarily",
                "probably",
                "promptly",
                "proud",
                "provides",
                "ps",
                "pt",
                "pu",
                "put",
                "py",
                "q",
                "qj",
                "qu",
                "que",
                "quickly",
                "quite",
                "qv",
                "r",
                "r2",
                "ra",
                "ran",
                "rather",
                "rc",
                "rd",
                "re",
                "readily",
                "really",
                "reasonably",
                "recent",
                "recently",
                "ref",
                "refs",
                "regarding",
                "regardless",
                "regards",
                "related",
                "relatively",
                "research",
                "research-articl",
                "respectively",
                "resulted",
                "resulting",
                "results",
                "rf",
                "rh",
                "ri",
                "right",
                "rj",
                "rl",
                "rm",
                "rn",
                "ro",
                "rq",
                "rr",
                "rs",
                "rt",
                "ru",
                "run",
                "rv",
                "ry",
                "s",
                "s2",
                "sa",
                "said",
                "same",
                "saw",
                "say",
                "saying",
                "says",
                "sc",
                "sd",
                "se",
                "sec",
                "second",
                "secondly",
                "section",
                "see",
                "seeing",
                "seem",
                "seemed",
                "seeming",
                "seems",
                "seen",
                "self",
                "selves",
                "sensible",
                "sent",
                "serious",
                "seriously",
                "seven",
                "several",
                "sf",
                "shall",
                "shan",
                "shan't",
                "she",
                "shed",
                "she'd",
                "she'll",
                "shes",
                "she's",
                "should",
                "shouldn",
                "shouldn't",
                "should've",
                "show",
                "showed",
                "shown",
                "showns",
                "shows",
                "si",
                "side",
                "significant",
                "significantly",
                "similar",
                "similarly",
                "since",
                "sincere",
                "six",
                "sixty",
                "sj",
                "sl",
                "slightly",
                "sm",
                "sn",
                "so",
                "some",
                "somebody",
                "somehow",
                "someone",
                "somethan",
                "something",
                "sometime",
                "sometimes",
                "somewhat",
                "somewhere",
                "soon",
                "sorry",
                "sp",
                "specifically",
                "specified",
                "specify",
                "specifying",
                "sq",
                "sr",
                "ss",
                "st",
                "still",
                "stop",
                "strongly",
                "sub",
                "substantially",
                "successfully",
                "such",
                "sufficiently",
                "suggest",
                "sup",
                "sure",
                "sy",
                "system",
                "sz",
                "t",
                "t1",
                "t2",
                "t3",
                "take",
                "taken",
                "taking",
                "tb",
                "tc",
                "td",
                "te",
                "tell",
                "ten",
                "tends",
                "tf",
                "th",
                "than",
                "thank",
                "thanks",
                "thanx",
                "that",
                "that'll",
                "thats",
                "that's",
                "that've",
                "the",
                "their",
                "theirs",
                "them",
                "themselves",
                "then",
                "thence",
                "there",
                "thereafter",
                "thereby",
                "thered",
                "therefore",
                "therein",
                "there'll",
                "thereof",
                "therere",
                "theres",
                "there's",
                "thereto",
                "thereupon",
                "there've",
                "these",
                "they",
                "theyd",
                "they'd",
                "they'll",
                "theyre",
                "they're",
                "they've",
                "thickv",
                "thin",
                "think",
                "third",
                "this",
                "thorough",
                "thoroughly",
                "those",
                "thou",
                "though",
                "thoughh",
                "thousand",
                "three",
                "throug",
                "through",
                "throughout",
                "thru",
                "thus",
                "ti",
                "til",
                "tip",
                "tj",
                "tl",
                "tm",
                "tn",
                "to",
                "together",
                "too",
                "took",
                "toward",
                "towards",
                "tp",
                "tq",
                "tr",
                "tried",
                "tries",
                "truly",
                "try",
                "trying",
                "ts",
                "t's",
                "tt",
                "tv",
                "twelve",
                "twenty",
                "twice",
                "two",
                "tx",
                "u",
                "u201d",
                "ue",
                "ui",
                "uj",
                "uk",
                "um",
                "un",
                "under",
                "unfortunately",
                "unless",
                "unlike",
                "unlikely",
                "until",
                "unto",
                "uo",
                "upon",
                "ups",
                "ur",
                "us",
                "use",
                "used",
                "useful",
                "usefully",
                "usefulness",
                "uses",
                "using",
                "usually",
                "ut",
                "v",
                "va",
                "value",
                "various",
                "vd",
                "ve",
                "ve",
                "very",
                "via",
                "viz",
                "vj",
                "vo",
                "vol",
                "vols",
                "volumtype",
                "vq",
                "vs",
                "vt",
                "vu",
                "w",
                "wa",
                "want",
                "wants",
                "was",
                "wasn",
                "wasnt",
                "wasn't",
                "way",
                "we",
                "wed",
                "we'd",
                "welcome",
                "well",
                "we'll",
                "well-b",
                "went",
                "were",
                "we're",
                "weren",
                "werent",
                "weren't",
                "we've",
                "what",
                "whatever",
                "what'll",
                "whats",
                "what's",
                "when",
                "whence",
                "whenever",
                "when's",
                "where",
                "whereafter",
                "whereas",
                "whereby",
                "wherein",
                "wheres",
                "where's",
                "whereupon",
                "wherever",
                "whether",
                "which",
                "while",
                "whim",
                "whither",
                "who",
                "whod",
                "whoever",
                "whole",
                "who'll",
                "whom",
                "whomever",
                "whos",
                "who's",
                "whose",
                "why's",
                "wi",
                "widely",
                "will",
                "willing",
                "wish",
                "with",
                "within",
                "without",
                "wo",
                "won",
                "wonder",
                "wont",
                "won't",
                "words",
                "world",
                "would",
                "wouldn",
                "wouldnt",
                "wouldn't",
                "www",
                "x",
                "x1",
                "x2",
                "x3",
                "xf",
                "xi",
                "xj",
                "xk",
                "xl",
                "xn",
                "xo",
                "xs",
                "xt",
                "xv",
                "xx",
                "y",
                "y2",
                "yes",
                "yet",
                "yj",
                "yl",
                "you",
                "youd",
                "you'd",
                "you'll",
                "your",
                "youre",
                "you're",
                "yours",
                "yourself",
                "yourselves",
                "you've",
                "yr",
                "ys",
                "yt",
                "z",
                "zero",
                "zi",
                "zz",
            ];
        }
    }
);
