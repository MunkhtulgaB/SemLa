const RELCHART_LEFT_WIDTH = 45; // in percents


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

function updateImportanceChart(d, dataset_name) {
    return new Promise((resolve, reject) => {
        $.ajax(`importances?dataset=${dataset_name}&index=${d.idx}`)
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
                // alert("error");
                reject();
            });
    });
}

function createImportanceChart(container_id, data) {
    const ctx = document.getElementById(container_id);

    Chart.defaults.font.size = 12;
    const config = {
        type: "bar",
        data: data,
        options: {
            layout: {
                padding: 0,
            },
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
                    labels: {
                        font: {
                            size: 12
                        },
                        boxWidth: 18,
                        padding: 5,
                    }
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
                    (x) => Math.abs(x) / res.attn_importance.reduce((a,b) => a + Math.abs(b), 0)
                ),
                borderColor: "white",
                borderWidth: 2,
                backgroundColor: "#0072b2",
            },
            {
                label: "Integrated Gradient",
                data: integrad_abs.map(
                    (x) => x / integrad_abs.reduce((a,b) => a + b, 0)
                ),
                borderColor: "white",
                borderWidth: 2,
                backgroundColor: "#e69f00",
            },
            {
                label: "Gradient",
                data: grad_abs.map(
                    (x) => x / grad_abs.reduce((a,b) => a + b, 0)
                ),
                borderColor: "white",
                borderWidth: 2,
                backgroundColor: "#009E73",
            },
            {
                label: "LIME",
                data: lime_abs.map(
                    (x) => x / lime_abs.reduce((a,b) => a + b, 0)
                ),
                borderColor: "white",
                borderWidth: 2,
                backgroundColor: "#56B4E9",
            },
        ],
    };

    return data;
}



// Relation charts
let relChart1;
let relChart2;

function emptyImportanceChart() {
    d3.selectAll("#importance_chart > *").remove();
}

function emptyRelationChart() {
    d3.selectAll("svg#rel_chart > *").remove();
    d3.selectAll("svg#rel_chart_left > *").remove();
}

function emptyTokenChart() {
    d3.selectAll("svg#token_chart > *").remove();
    d3.selectAll("svg#token_chart_left > *").remove();
}

function updateRelationChartFromCache(res) {
    const tokens1 = res.tokens1;

    const current_tokens1 = d3
        .selectAll("svg#rel_chart > .text_left")
        .data()
        .map((d) => d.token);
    
    if (current_tokens1.join(" ") == tokens1.join(" ")) {
        $("#rel_chart_left_container").animate({
            width: RELCHART_LEFT_WIDTH + "%",
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
}

function updateImportanceChartFromCache(res) {
    const importanceData = formatImportanceData(res);
    if (importanceChart) importanceChart.destroy();
    importanceChart = createImportanceChart(
        "importance_chart",
        importanceData
    );
}

function updateTokenChartFromCache(res) {
    const current_tokens1 = d3
        .selectAll("svg#token_chart > .text_left")
        .data()
        .map((d) => d.token);

    const tokens1 = res.tokens1;
    if (current_tokens1.join(" ") == tokens1.join(" ")) {
        $("#token_chart_left_container").animate({
            width: RELCHART_LEFT_WIDTH + "%",
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

}

function updateRelationChart(idx1, idx2, dataset_name) {
    if (idx1 == idx2) return;

    const current_tokens1 = d3
        .selectAll("svg#rel_chart > .text_left")
        .data()
        .map((d) => d.token);

    const reltype = "integrad";

    return new Promise((resolve, reject) => {
        $.ajax(
            `relation?dataset=${dataset_name}&index1=${idx1}&index2=${idx2}&reltype=${reltype}`
        )
            .done(function (res) {
                const tokens1 = res.tokens1;
                if (current_tokens1.join(" ") == tokens1.join(" ")) {
                    $("#rel_chart_left_container").animate({
                        width: RELCHART_LEFT_WIDTH + "%",
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
                // alert("There is an issue at the moment. Please try again soon.");
                reject();
            });
    });
}

function updateTokenChart(idx1, idx2, dataset_name) {
    if (idx1 == idx2) return;

    const current_tokens1 = d3
        .selectAll("svg#token_chart > .text_left")
        .data()
        .map((d) => d.token);

    const reltype = "token2token";

    return new Promise((resolve, reject) => {
        $.ajax(
            `relation?dataset=${dataset_name}&index1=${idx1}&index2=${idx2}&reltype=${reltype}`
        )
            .done(function (res) {
                const tokens1 = res.tokens1;
                if (current_tokens1.join(" ") == tokens1.join(" ")) {
                    $("#token_chart_left_container").animate({
                        width: RELCHART_LEFT_WIDTH + "%",
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
                // alert("There is an issue at the moment. Please try again soon.");
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
    const fontsize = 15;
    const relchart = d3.select(container_selector);

    const chart_height = relchart.node().clientHeight;
    const chart_width = relchart.node().clientWidth;
    const spacing =
        (chart_height - data.length * fontsize) / ((data.length - 1) || 1);

    const text_anchor = is_left_col ? "start" : "end";
    const text_class = "text" + (is_left_col ? "_left" : "_right");
    const rect_class = "rect" + (is_left_col ? "_left" : "_right");
    const text_x = is_left_col ? 0 : chart_width;
    const rect_opacity = (d) =>
        d.importance ? 0.5 * normalize_magnitude(all_importance, Math.abs(d.importance)) : 0;

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
        .attr("y", (d) => {
            return (d.pos + 1) * fontsize + d.pos * spacing;
        });
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
        ((res.tokens1.length - 1) || 1);
    const spacing_right_col =
        (chart_height - res.tokens2.length * fontsize) /
        ((res.tokens2.length - 1) || 1);
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
    const x_start = Math.max(...left_text_bboxes.map((b) => b.width)) + 5;
    const x_end = chart_width - (Math.max(...right_text_bboxes.map((b) => b.width)) + 5);
    const x_middle = x_start + (x_end - x_start) / 2;
    
    const getHeight = (d) =>
        10 * normalize_magnitude(all_importance, Math.abs(d.importance));

    const pos_left = leftcol_data
        .filter((dp) => dp.importance > 0);
    const neg_left = leftcol_data
        .filter((dp) => dp.importance < 0);
    const pos_right = rightcol_data
        .filter((dp) => dp.importance > 0);
    const neg_right = rightcol_data
        .filter((dp) => dp.importance < 0);

    const pos_height = pos_left.concat(pos_right)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);

    const neg_height = neg_left.concat(neg_right)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);
    const total_height = pos_height + neg_height;

    const PAD = 0;
    const start_line_pos = chart_height / 2 - total_height / 2;
    const start_line_neg =
        PAD +
        chart_height / 2 +
        total_height / 2 -
        neg_height;

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
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);
                    const negatives_so_far_sum = leftcol_data
                        .slice(0, i)
                        .filter((dp) => dp.importance < 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);

                    const y_start_line =
                        d.importance > 0 ? start_line_pos : start_line_neg;
                    const y_offset =
                        d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                    return {
                        token: d.token,
                        pos: i,
                        source: {
                            x: x_start,
                            y: (d.pos + 1) * fontsize + d.pos * spacing_left_col,
                        },
                        target: {
                            x: x_middle,
                            y: y_start_line + y_offset + getHeight(d) / 2,
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
            d.importance ? 10 * normalize_magnitude(all_importance, Math.abs(d.importance)) : 0
        )
        .style(
            "stroke-opacity",
            (d) => 0.2 + 0.8 * normalize_magnitude(all_importance, Math.abs(d.importance))
        );

    const right_lines = relchart
        .selectAll(".right_links")
        .data(
            rightcol_data
                .filter((dp) => !isNaN(dp.importance))
                .map(function (d, i) {
                    const positives_so_far_sum = rightcol_data
                        .slice(0, i)
                        .concat(leftcol_data)
                        .filter((dp) => dp.importance > 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);
                    const negatives_so_far_sum = rightcol_data
                        .slice(0, i)
                        .concat(leftcol_data)
                        .filter((dp) => dp.importance < 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);

                    const y_start_line =
                        d.importance > 0 ? start_line_pos : start_line_neg;
                    const y_offset =
                        d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                    return {
                        token: d.token,
                        pos: i,
                        source: {
                            x: x_middle,
                            y: y_start_line + y_offset + getHeight(d) / 2,
                        },
                        target: {
                            x: x_end,
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
            d.importance ? 10 * normalize_magnitude(all_importance, Math.abs(d.importance)) : 0
        )
        .style(
            "stroke-opacity",
            (d) => 0.2 + 0.8 * normalize_magnitude(all_importance, Math.abs(d.importance))
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
                height: pos_height,
                y: start_line_pos,
            },
            {
                sign: -1,
                fill: "pink",
                stroke: "red",
                height: neg_height,
                y: start_line_neg,
            },
        ])
        .enter()
        .append("rect")
        .attr("fill", (d) => d.fill)
        .attr("stroke", (d) => d.stroke)
        .attr("x", x_middle - block_width / 2)
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
                    ${d.sign > 0 ? 
                        pos_left.concat(pos_right)
                            .map(d => d.importance)
                            .reduce((a, b) => a + b, 0)
                            .toFixed(1): 
                        neg_left.concat(neg_right)
                            .map(d => d.importance)
                            .reduce((a, b) => a + b, 0)
                            .toFixed(1)
                    }`
                )
                .style("top", event.pageY + 10 + "px")
                .style("left", event.pageX + 10 + "px");
        })
        .on("mouseout", function (d) {
            updateRelLinks();
        });

    d3.selectAll(".rel_link")
        .on("mouseover", function (d) {
            d3.select("#rel_chart_tooltip")
                .style("visibility", "visible")
                .html(
                    `Importance of ${d.token} (integrated gradient): ${d.importance.toFixed(3)}`
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
        ((res.tokens2.length - 1) || 1);
    const spacing_right_col =
        (chart_height - res.tokens1.length * fontsize) /
        ((res.tokens1.length - 1) || 1);

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
    const chart_width = d3.select("#rel_chart_left_container")
        .node().parentNode.clientWidth * (RELCHART_LEFT_WIDTH/100);

    const x_start = Math.max(...left_text_bboxes.map((b) => b.width)) + 5;
    const x_end = chart_width * 0.9;
    const x_middle = x_start + (x_end - x_start) / 2;
    
    const getHeight = (d) =>
        10 * normalize_magnitude(all_importance, Math.abs(d.importance));

    const pos_left = leftcol_data
        .filter((dp) => dp.importance > 0);
    const neg_left = leftcol_data
        .filter((dp) => dp.importance < 0);
    const pos_right = rightcol_data
        .filter((dp) => dp.importance > 0);
    const neg_right = rightcol_data
        .filter((dp) => dp.importance < 0);

    const pos_height = pos_left.concat(pos_right)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);
    const neg_height = neg_left.concat(neg_right)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);

    const total_height = pos_height + neg_height;

    const PAD = 0;
    const start_line_pos = chart_height / 2 - total_height / 2;
    const start_line_neg =
        PAD +
        chart_height / 2 +
        total_height / 2 -
        neg_height;

    let linkGenerator = d3
        .linkHorizontal()
        .x((d) => d.x)
        .y((d) => d.y);

    const left_lines = relchart_left
        .selectAll(".left_links_contrast")
        .data(
            leftcol_data
                .filter((dp) => !isNaN(dp.importance))
                .map(function (d, i) {
                    const positives_so_far_sum = leftcol_data
                        .slice(0, i)
                        .filter((dp) => dp.importance > 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);
                    const negatives_so_far_sum = leftcol_data
                        .slice(0, i)
                        .filter((dp) => dp.importance < 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);

                    const y_start_line =
                        d.importance > 0 ? start_line_pos : start_line_neg;
                    const y_offset =
                        d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                    return {
                        source: {
                            x: x_start,
                            y: (d.pos + 1) * fontsize + d.pos * spacing_left_col,
                        },
                        target: {
                            x: x_middle,
                            y: y_start_line + y_offset + getHeight(d) / 2,
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
            d.importance ? 10 * normalize_magnitude(all_importance, Math.abs(d.importance)) : 0
        )
        .style(
            "stroke-opacity",
            (d) => 0.2 + 0.8 * normalize_magnitude(all_importance, Math.abs(d.importance))
        );

    const right_lines = relchart_left
        .selectAll(".right_links_contrast")
        .data(
            rightcol_data
                .filter((dp) => !isNaN(dp.importance))
                .map(function (d, i) {
                    const positives_so_far_sum = rightcol_data
                        .slice(0, i)
                        .concat(leftcol_data)
                        .filter((dp) => dp.importance > 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);
                    const negatives_so_far_sum = rightcol_data
                        .slice(0, i)
                        .concat(leftcol_data)
                        .filter((dp) => dp.importance < 0)
                        .map(getHeight)
                        .reduce((a, b) => a + b, 0);

                    const y_start_line =
                        d.importance > 0 ? start_line_pos : start_line_neg;
                    const y_offset =
                        d.importance > 0 ? positives_so_far_sum : negatives_so_far_sum;

                    return {
                        source: {
                            x: x_middle,
                            y: y_start_line + y_offset + getHeight(d) / 2,
                        },
                        target: {
                            x: x_end,
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
            d.importance ? 10 * normalize_magnitude(all_importance, Math.abs(d.importance)) : 0
        )
        .style(
            "stroke-opacity",
            (d) => 0.2 + 0.8 * normalize_magnitude(all_importance, Math.abs(d.importance))
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
                height: pos_height,
                y: start_line_pos,
            },
            {
                sign: -1,
                fill: "pink",
                stroke: "red",
                height: neg_height,
                y: start_line_neg,
            },
        ])
        .enter()
        .append("rect")
        .attr("fill", (d) => d.fill)
        .attr("stroke", (d) => d.stroke)
        .attr("x", x_middle - block_width / 2)
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
                    ${d.sign > 0 ? 
                        pos_left.concat(pos_right)
                            .map(d => d.importance)
                            .reduce((a, b) => a + b, 0)
                            .toFixed(1): 
                        neg_left.concat(neg_right)
                            .map(d => d.importance)
                            .reduce((a, b) => a + b, 0)
                            .toFixed(1)
                    }`
                )
                .style("top", event.pageY + 10 + "px")
                .style("left", event.pageX + 10 + "px");
        })
        .on("mouseout", function (d) {
            updateRelLinks();
        });

    // Recalculate stroke opacity for previously visible lines
    d3.selectAll(".left_links").style(
        "stroke-opacity",
        (d) => 0.2 + 0.8 * normalize_magnitude(all_importance, Math.abs(d.importance))
    );
    d3.selectAll(".right_links").style(
        "stroke-opacity",
        (d) => 0.2 + 0.8 * normalize_magnitude(all_importance, Math.abs(d.importance))
    );

    // Similarly, recalculate opacity of previously visible highlight rects
    const relchart = d3.select("svg#rel_chart");

    relchart
        .selectAll(".right_rect")
        .attr("fill-opacity", (d) =>
            d.importance
                ? 0.5 * normalize_magnitude(all_importance, Math.abs(d.importance))
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

    updateRelLinks();
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
    updateTokenLinks();
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
        ((res.tokens1.length - 1) || 1);
    const spacing_right_col =
        (chart_height - res.tokens2.length * fontsize) /
        ((res.tokens2.length - 1) || 1);

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
        .style("stroke", (d) => (d.strength > 0 ? "skyblue" : "pink"))
        .style(
            "stroke-width",
            (d) => 10 * normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
        )
        .style(
            "stroke-opacity",
            (d) => normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
        );
}

function renderSecondTokenChart(res) {
    // Draw text
    const fontsize = 13;
    const tokenchart_left = d3.select("svg#token_chart_left");
    const chart_height = tokenchart_left.node().clientHeight;
    const spacing_left_col =
        (chart_height - res.tokens2.length * fontsize) /
        ((res.tokens2.length - 1) || 1);
    const spacing_right_col =
        (chart_height - res.tokens1.length * fontsize) /
        ((res.tokens1.length - 1) || 1);

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
        .style("stroke", (d) => (d.strength > 0 ? "skyblue" : "pink"))
        .style(
            "stroke-width",
            (d) => 2 + 10 * normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
        )
        .style(
            "stroke-opacity",
            (d) => 0.1 + normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
        );
    
    // Recalculate the previous links' weights
    d3.selectAll(".token_links")
        .style(
            "stroke-width",
            (d) => 10 * normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
        )
        .style(
            "stroke-opacity",
            (d) => normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
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

    updateTokenLinks();
}


function updateTextSummary(d, closest_dp, dp2) {
    const is_prediction_correct = d.prediction == d.ground_truth;
    const color = (is_prediction_correct)? "green": "#FF2400";
    const contrast_color =  (is_prediction_correct)? "#FF2400": "green";

    const html = `<div>
            <p><b>Text: </b> ${d.text}<p>
            <p><b>Predicted</b> label was 
                <b>
                    <span style="color: ${color}">
                    ${d.prediction}
                    </span>
                </b>
                based on closest support example.
            </p>
            ${!is_prediction_correct
                ? `<p><b>Ground-truth</b> label is <b>${d.ground_truth}</b>.</p>`
                : ""
            }
            </div>

            <hr>
            <div>
            <div><b>Closest support example: </b></div>
            ${closest_dp.text}
            <span style="color: ${color}">
                (<b>${closest_dp.ground_truth}</b>)
            </span>
            </div>

            <hr>
            <div>
            <div><b>${is_prediction_correct
                ? "Next closest example:"
                : "Correct support example:"
            }</b></div>
            ${dp2.text}
            <span style="color: ${contrast_color}">
                (<b>${dp2.ground_truth}</b>)
            </span>
            </div>`;
    

    d3.select("#summary")
        .html(html)
    
    d3.selectAll(".contrast-label-instance")
        .html(`<span style="color: ${contrast_color}">(${dp2.ground_truth})</span>`);
    d3.selectAll(".predicted-label-instance")
        .html(`<span style="color: ${color}">(${d.prediction})</span>`);
}

function normalize_magnitude(values, value) {
    let abs_values = values.map(x => Math.abs(x));

    if (value && !abs_values.includes(Math.abs(value))) {
        throw new Error("value must be included in values");
    }

    abs_values = abs_values.filter((v) => !isNaN(v));
    const max_val = Math.max(...abs_values);
    const min_val = 0; // smallest magnitude is zero
    const val_range = max_val - min_val;

    if (value) {
        return value / val_range;
    } else {
        return values.map((val) => val / val_range);
    }
}


function initializeRelChartControls() {
    d3.select("#topk_relchart")
        .on("change", function() {
            updateRelLinks();
        })
    d3.select("#topk_tokenchart")
        .on("change", function() {
            updateTokenLinks();
        })
}

function updateRelLinks() {
    const topk = $("#topk_relchart").val();
    filterRelLinks(".left_links", topk, "importance");
    filterRelLinks(".right_links", topk, "importance");
    filterRelLinks(".left_links_contrast", topk, "importance");
    filterRelLinks(".right_links_contrast", topk, "importance");
}

function updateTokenLinks() {
    const topk = $("#topk_tokenchart").val();
    filterRelLinks(".token_links", topk, "strength");
    filterRelLinks(".token_links_contrast", topk, "strength");
}

function filterRelLinks(linkSelector, topk, byAttr) {
    const leftLinks = d3.selectAll(linkSelector).data()
            .sort((a,b) => 
                Math.abs(b[byAttr]) - Math.abs(a[byAttr])
            );
    d3.selectAll(linkSelector)
        .style("visibility", function(d) {
            if (topk == null || topk == 0) return "hidden";
            
            topk = Math.min(topk, leftLinks.length);
            const topk_value = leftLinks[topk - 1][byAttr];
            if (Math.abs(d[byAttr]) >= Math.abs(topk_value)) {
                return "visible";
            } else {
                return "hidden";
            }
        });
}


export { updateRelationChartFromCache,
        updateImportanceChartFromCache,
        updateTokenChartFromCache,
        updateRelationChart, 
        updateImportanceChart,
        updateTokenChart,
        updateTextSummary,
        loadingImportanceChart, 
        emptyImportanceChart,
        emptyRelationChart,
        emptyTokenChart,
        initializeRelChartControls
}