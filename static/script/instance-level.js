const RELCHART_LEFT_WIDTH_RATIO = 45; // in percents
const RELCHART_RIGHT_WIDTH_RATIO = 100 - RELCHART_LEFT_WIDTH_RATIO;
const MIN_TOKEN_SPACING = -2;


/*
 * Importance chart section
 */

class ImportanceView {

    container_id;
    current_chart;
    fontsize;
    legend_fontsize;

    constructor(container_id, fontsize, legend_fontsize) {
        this.container_id = container_id;
        this.fontsize = fontsize || 14;
        this.legend_fontsize = legend_fontsize || 10;
    }

    update(importanceData) {
        if (!Object.hasOwn(importanceData, "labels")) {
            importanceData = this.formatImportanceData(importanceData);
        }
        this.importanceData = importanceData;

        this.empty();
        this.current_chart = this.createImportanceChart();
        d3.select(`#${this.container_id}`).datum(this.importanceData);
    }

    empty() {
        if (this.current_chart) this.current_chart.destroy();
        d3.selectAll(`#${this.container_id} > *`).remove();
    }

    createImportanceChart() {
        const ctx = document.getElementById(this.container_id);

        Chart.defaults.font.size = this.fontsize;
        const config = {
            type: "bar",
            data: this.importanceData,
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
                                size: this.legend_fontsize
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

    formatImportanceData(importanceData) {
        const integrad_abs = importanceData.integrad_importance.map((x) => Math.abs(x));
        const lime_abs = importanceData.lime_importance.map((x) => Math.abs(x));
        const grad_abs = importanceData.grad_importance.map((x) => Math.abs(x));

        const formatted_data = {
            labels: importanceData.tokens,
            datasets: [
                {
                    label: "Attention",
                    data: importanceData.attn_importance.map(
                        (x) => Math.abs(x) / importanceData.attn_importance.reduce((a,b) => a + Math.abs(b), 0)
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

        return formatted_data;
    }
}

/*
 * Relation chart section
 */
class Token2SimilarityRelationView {

    container_id;
    fontsize;

    constructor(container_id, fontsize) {
        this.container_id = container_id;
        this.left_chart_container_selector = `#${container_id} .rel_chart_left`;
        this.right_chart_container_selector = `#${container_id} .rel_chart_right`;
        this.fontsize = fontsize || 14;
    }

    createRelChart() {
        const container = d3.select(`#${this.container_id}`);
        const topk = $(`#rel-chart-container input.topk_relchart`).val() || 3;
        container.html(`<div class="relchart-control">
                            Showing top-<input type="number" class="topk_relchart" min="1" value=${topk}> important links per sample...
                        </div>
                        <div class="relchart-header">
                            <div>
                            Contrast sample
                            <br>
                            <div class="contrast-label-instance"></div>
                            </div>
                            <div>
                            Selected sample
                            <br>
                            <div class="predicted-label-instance"></div>
                            </div>
                            <div>
                            Closest sample
                            <br>
                            <div class="predicted-label-instance"></div>
                            </div>
                        </div>
                        <div class="padded-container sample-lvl-content">
                            <div class="rel-container widget_content">
                                <div class="rel_chart_left">
                                </div>
                                <div class="rel_chart_right">
                                </div>
                            </div>
                        </div>
        `);

        return new Promise(function (resolve, reject) {
            // This is needed to ensure the chart height is calculated after the container is rendered
            setTimeout(function(){
                const canvas_container = d3.select(this.right_chart_container_selector).node().parentNode;
                this.chart_height = canvas_container.clientHeight;
                this.chart_width = canvas_container.clientWidth;
                resolve(this.chart_height);
            }.bind(this), 1);
        }.bind(this));
    }

    async update(data_right, data_left) {
        if (!data_right && !data_left) return;

        this.data_right = data_right;
        this.data_left = data_left;

        await this.createRelChart();
        d3.select(`#${this.container_id} input.topk_relchart`)
            .on("change", function() {
                const topk = $(this).val();
                updateRelLinks(parseInt(topk));
                d3.selectAll("input.topk_relchart").property("value", topk);
            })
    
        // First, render the right half
        $(this.left_chart_container_selector).animate({  
            width: "0px",
        });
        this.renderRelChart();
        d3.select(this.right_chart_container_selector).datum(data_right);

        // Then, render the left half
        $(this.left_chart_container_selector).animate({
            width: RELCHART_LEFT_WIDTH_RATIO + "%",
        });
        this.renderSecondRelChart();
        d3.select(this.left_chart_container_selector).datum(data_left);
    }

    renderRelChart() {
        // Draw texts
        d3.select(this.right_chart_container_selector)
            .append("svg");
        const canvas_selector = `${this.right_chart_container_selector} svg`;
        const relchart = d3.select(canvas_selector).attr("class", "rel-chart-half-canvas");
        const leftcol_data = this.data_right.tokens1.map((t, i) => ({
            token: t,
            pos: i,
            importance: this.data_right.importance1[i],
        }));
        const rightcol_data = this.data_right.tokens2.map((t, i) => ({
            token: t,
            pos: i,
            importance: this.data_right.importance2[i],
        }));

        const all_importance = this.data_right.importance1
            .concat(this.data_right.importance2)
            .concat(this.data_left.importance1)
            .concat(this.data_left.importance2);

        const rel_chart_width = this.chart_width * (RELCHART_RIGHT_WIDTH_RATIO/100);

        const [left_text_bboxes, spacing_left] = renderRelTexts(
            canvas_selector,
            leftcol_data,
            all_importance,
            this.chart_height,
            rel_chart_width,
            this.fontsize,
            true,
            (d) => {
                onMouseOverRelChart(d);
                onMouseOverCenterTokenInTokenChart(d);
            }
        );
        const [right_text_bboxes, spacing_right] = renderRelTexts(
            canvas_selector,
            rightcol_data,
            all_importance,
            this.chart_height,
            rel_chart_width,
            this.fontsize,
            false,
            (d) => {
                onMouseOverRelChart(d);
                onMouseOverRightTokenInTokenChart(d);
            }
        );

        // Stretch the container to fit all words if they don't fit due to minimum spacing constraint 
        // This is to activate the scrolling behaviour of the parent element
        const height_with_spacing_left = spacing_left * ((leftcol_data.length - 1) || 1) + (leftcol_data.length + 2) * this.fontsize;
        const height_with_spacing_right = spacing_right * ((rightcol_data.length - 1) || 1) + (rightcol_data.length + 2) * this.fontsize;
        relchart.style("height", Math.max(height_with_spacing_left, height_with_spacing_right));

        // Draw links
        const x_start = Math.max(...left_text_bboxes.map((b) => b.width)) + 5;
        const x_end = rel_chart_width - (Math.max(...right_text_bboxes.map((b) => b.width)) + 5);
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
        const start_line_pos = this.chart_height / 2 - total_height / 2;
        const start_line_neg =
            PAD +
            this.chart_height / 2 +
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
                                y: left_text_bboxes[d.pos].y + left_text_bboxes[d.pos].height/2,
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
                                y: right_text_bboxes[d.pos].y + right_text_bboxes[d.pos].height/2,
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
                d3.selectAll(`#${this.container_id} .rel_link`)
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
                    .style("top", d3.event.pageY + 10 + "px")
                    .style("left", d3.event.pageX + 10 + "px");
            }.bind(this))
            .on("mouseout", function (d) {
                const topk = $(`${this.right_chart_container_selector.replace(".rel_chart_right", " ")} input.topk_relchart`).val();
                updateRelLinks(parseInt(topk));
            }.bind(this));
        
        d3.selectAll(`#${this.container_id} .rel_link`)
            .on("mouseover", function (d) {
                d3.select("#rel_chart_tooltip")
                    .style("visibility", "visible")
                    .html(
                        `Importance of ${d.token} (integrated gradient): ${d.importance.toFixed(3)}`
                    )
                    .style("top", d3.event.pageY + 10 + "px")
                    .style("left", d3.event.pageX + 10 + "px");
            })
            .on("mouseout", function (d) {
                d3.select("#rel_chart_tooltip").style("visibility", "hidden");
            });
    }


    renderSecondRelChart() {
        // Get the right column spacing from the already rendered half of the relchart
        const svg_canvas_selector_of_first_rel_chart_half = `${this.right_chart_container_selector} svg`;
        const right_col_text_bboxes = d3.selectAll(`${svg_canvas_selector_of_first_rel_chart_half} > .rect_left`);
        const right_col_ys = right_col_text_bboxes.nodes().map(bbox => parseFloat(bbox.getAttribute("y")));
        const right_col_heights = right_col_text_bboxes.nodes().map(bbox => parseFloat(bbox.getAttribute("height")));

        // Draw text
        d3.select(this.left_chart_container_selector)
            .append("svg");
        const canvas_selector = `${this.left_chart_container_selector} svg`;
        const relchart_left = d3.select(canvas_selector).attr("class", "rel-chart-half-canvas");
        const chart_height = relchart_left.node().clientHeight;

        const rightcol_data = this.data_left.tokens1.map((t, i) => ({
            token: t,
            pos: i,
            importance: this.data_left.importance1[i],
        }));
        const leftcol_data = this.data_left.tokens2.map((t, i) => ({
            token: t,
            pos: i,
            importance: this.data_left.importance2[i],
        }));

        const importance3 = this.data_right.importance1;
        const importance4 = this.data_right.importance2;
        const all_importance = this.data_left.importance1
            .concat(this.data_left.importance2)
            .concat(importance3)
            .concat(importance4);

        const rel_chart_left_width = this.chart_width * (RELCHART_LEFT_WIDTH_RATIO/100);
        const [left_text_bboxes, spacing_left] = renderRelTexts(
            canvas_selector,
            leftcol_data,
            all_importance,
            this.chart_height,
            rel_chart_left_width,
            this.fontsize,
            true,
            (d) => {
                onMouseOverRelChart(d);
                onMouseOverLeftTokenInTokenChart(d);
            }
        );

        // Stretch the container to fit all words if they don't fit due to minimum spacing constraint 
        // This is to activate the scrolling behaviour of the parent element
        const height_with_min_spacing = spacing_left * ((leftcol_data.length - 1) || 1) + (leftcol_data.length + 2) * this.fontsize;
        relchart_left.style("height", height_with_min_spacing);

        // Render links
        const x_start = Math.max(...left_text_bboxes.map((b) => b.width)) + 5;
        const x_end = rel_chart_left_width * 0.9;
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
        const start_line_pos = this.chart_height / 2 - total_height / 2;
        const start_line_neg =
            PAD +
            this.chart_height / 2 +
            total_height / 2 -
            neg_height;

        let linkGenerator = d3
            .linkHorizontal()
            .x((d) => d.x)
            .y((d) => d.y);

        const left_lines = relchart_left
            .selectAll(`#${this.container_id} .left_links_contrast`)
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
                                y: left_text_bboxes[d.pos].y + left_text_bboxes[d.pos].height/2,
                            },
                            target: {
                                x: x_middle,
                                y: y_start_line + y_offset + getHeight(d) / 2,
                            },
                            importance: d.importance,
                            token: d.token,
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
            .selectAll(`#${this.container_id} .right_links_contrast`)
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
                                y: right_col_ys[d.pos] + right_col_heights[d.pos]/2,
                            },
                            importance: d.importance,
                            token: d.token,
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
                d3.selectAll(`#${this.container_id} .rel_link`)
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
            }.bind(this))
            .on("mouseout", function (d) {
                const topk = $(`${this.left_chart_container_selector.replace(".rel_chart_left", " ")} input.topk_relchart`).val();
                updateRelLinks(parseInt(topk));
            }.bind(this));

        // For the middle texts, highlight by contrastiveness
        const contrastiveness_scores = this.data_left.importance1
            .map((s, i) => Math.abs(s - importance4[i]))
            .filter((s) => !isNaN(s));
        const distinguishing_factor_idx = contrastiveness_scores.indexOf(
            Math.max(...contrastiveness_scores)
        );

        d3.select(`${this.right_chart_container_selector} svg`)
            .selectAll(".rect_left")
            .attr("fill", "yellow")
            .attr("fill-opacity", (d) =>
                distinguishing_factor_idx == d.pos ? 1 : 0
            );

        // Show importance value of link on hover
        d3.selectAll(`#${this.container_id} .rel_link`)
            .on("mouseover", function (d) {
                d3.select("#rel_chart_tooltip")
                    .style("visibility", "visible")
                    .html(
                        `
                        <div>"${d.token}": ${d.importance ? d.importance.toFixed(3) : ""}</div>
                        <div>(token, importance)</div>
                        <div style="color:grey">Note: the importance is calculated with Integrated Gradient</div>
                        `
                    )
                    .style("top", event.pageY + 10 + "px")
                    .style("left", event.pageX + 10 + "px");
            })
            .on("mouseout", function (d) {
                d3.select("#rel_chart_tooltip").style("visibility", "hidden");
            });

        const topk = $(`${this.left_chart_container_selector.replace(".rel_chart_left", " ")} input.topk_relchart`).val();
        updateRelLinks(parseInt(topk));
    }
}

/*
 * Token chart section
 */
class Token2TokenRelationView {
    container_id;
    fontsize;

    constructor(container_id, fontsize) {
        this.container_id = container_id;
        this.left_chart_container_selector =  `#${container_id} .rel_chart_left`;
        this.right_chart_container_selector =  `#${container_id} .rel_chart_right`;
        this.fontsize = fontsize || 14;
    }

    createTokenChart() {
        const container = d3.select(`#${this.container_id}`);
        const topk = $(`#token-chart-container input.topk_tokenchart`).val() || 3;
        container.html(`<div class="relchart-control">
                            Showing top-<input type="number" class="topk_tokenchart" min="1" value=${topk}> important links per side...
                        </div>
                        <div class="relchart-header">
                            <div>
                            Contrast sample
                            <br>
                            <div class="contrast-label-instance"></div>
                            </div>
                            <div>
                            Selected sample
                            <br>
                            <div class="predicted-label-instance"></div>
                            </div>
                            <div>
                            Closest sample
                            <br>
                            <div class="predicted-label-instance"></div>
                            </div>
                        </div>
                        <div class="padded-container sample-lvl-content">
                            <div class="tokenchart-container rel-container widget_content">
                                <div class="rel_chart_left rel-chart-half">
                                </div>
                                <div class="rel_chart_right rel-chart-half">
                                </div>
                            </div>
                        </div>
        `);
        
        
        return new Promise(function (resolve, reject) {
            // This is needed to ensure the chart height is calculated after the container is rendered
            setTimeout(function(){
                const canvas_container = d3.select(this.right_chart_container_selector).node().parentNode;
                this.chart_height = canvas_container.clientHeight;
                this.chart_width = canvas_container.clientWidth;
                resolve(this.chart_height);
            }.bind(this), 1);
        }.bind(this));
    }

    async update(data_right, data_left) {
        if (!data_right && !data_left) return;

        this.data_right = data_right;
        this.data_left = data_left;

        const self = this;
        const right_links = [];
        data_right.links.forEach(function (links, i) {
            links.forEach(function (link, j) {
                right_links.push({ from: i, to: j, 
                    from_token: self.data_right.tokens1[i], to_token: self.data_right.tokens2[j],
                    strength: link });
            });
        });
        this.right_links = right_links;

        const left_links = [];
        data_left.links.forEach(function (links, i) {
            links.forEach(function (link, j) {
                left_links.push({ from: j, to: i, 
                    from_token: self.data_left.tokens1[i], to_token: self.data_left.tokens2[j],
                    strength: link });
            });
        });
        this.left_links = left_links;
        
        await this.createTokenChart();
        d3.select(`#${this.container_id} input.topk_tokenchart`)
            .on("change", function() {
                const topk = $(this).val();
                updateTokenLinks(parseInt(topk));
                d3.selectAll("input.topk_tokenchart").property("value", topk);
            })

        // First, render the right half
        $(this.left_chart_container_selector).animate({
            width: "0px",
        });
        this.renderTokenChart();
        d3.select(this.right_chart_container_selector).datum(data_right);

        // Then, render the left half
        $(this.left_chart_container_selector).animate({
            width: RELCHART_LEFT_WIDTH_RATIO + "%",
        });
        this.renderSecondTokenChart();
        d3.select(this.left_chart_container_selector).datum(data_left);

    }

    renderTokenChart() {
        // Draw texts
        d3.select(this.right_chart_container_selector)
            .append("svg");
        const canvas_selector = `${this.right_chart_container_selector} svg`;
        const tokenchart = d3.select(canvas_selector).attr("class", "token-chart-half-canvas");
        const leftcol_data = this.data_right.tokens1.map((t, i) => ({
            token: t,
            pos: i,
            is_left: true,
        }));
        const rightcol_data = this.data_right.tokens2.map((t, i) => ({
            token: t,
            pos: i,
            is_left: false,
        }));
        
        let onMouseOver = function (d) {
            if (d.is_left) {
                onMouseOverCenterTokenInTokenChart(d);
            } else {
                onMouseOverRightTokenInTokenChart(d);
            }
        };

        const token_chart_width = this.chart_width * (RELCHART_RIGHT_WIDTH_RATIO/100);
        const [left_text_bboxes, spacing_left] = renderRelTexts(
            canvas_selector,
            leftcol_data,
            null,
            this.chart_height,
            token_chart_width,
            this.fontsize,
            true,
            onMouseOver,
            onMouseOutInTokenChart
        );
        const [right_text_bboxes, spacing_right] = renderRelTexts(
            canvas_selector,
            rightcol_data,
            null,
            this.chart_height,
            token_chart_width,
            this.fontsize,
            false,
            onMouseOver,
            onMouseOutInTokenChart
        );

        // Stretch the container to fit all words if they don't fit due to minimum spacing constraint 
        // This is to activate the scrolling behaviour of the parent element
        const height_with_spacing_left = spacing_left * ((leftcol_data.length - 1) || 1) + (leftcol_data.length + 2) * this.fontsize
        const height_with_spacing_right = spacing_right * ((rightcol_data.length - 1) || 1) + (rightcol_data.length + 2) * this.fontsize
        tokenchart.style("height", Math.max(height_with_spacing_left, height_with_spacing_right));

        // Draw links
        const all_link_strengths = this.right_links
            .concat(this.left_links)
            .map((l) => l.strength);

        tokenchart
            .selectAll(".token_links")
            .data(this.right_links)
            .enter()
            .append("line")
            .attr("class", "token_links")
            .attr("x1", Math.max(...left_text_bboxes.map((b) => b.width)) + 5)
            .attr("y1", (d) => left_text_bboxes[d.from].y + left_text_bboxes[d.from].height/2)
            .attr(
                "x2",
                token_chart_width - (Math.max(...right_text_bboxes.map((b) => b.width)) + 5)
            )
            .attr("y2", (d) => right_text_bboxes[d.to].y + right_text_bboxes[d.to].height/2)
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

    renderSecondTokenChart() {
        // Get the right column spacing from the already rendered half of the relchart
        const svg_canvas_selector_of_first_rel_chart_half = `${this.right_chart_container_selector} svg`;
        const right_col_text_bboxes = d3.selectAll(`${svg_canvas_selector_of_first_rel_chart_half} > .rect_left`);
        const right_col_ys = right_col_text_bboxes.nodes().map(bbox => parseFloat(bbox.getAttribute("y")));
        const right_col_heights = right_col_text_bboxes.nodes().map(bbox => parseFloat(bbox.getAttribute("height")));

        // Draw text
        const svg_canvas = d3.select(this.left_chart_container_selector)
            .append("svg");
        const canvas_selector = `${this.left_chart_container_selector} svg`;
        const tokenchart_left = d3.select(canvas_selector).attr("class", "token-chart-half-canvas");
        const leftcol_data = this.data_left.tokens2.map((t, i) => ({ token: t, pos: i }));

        const token_chart_left_width = this.chart_width * (RELCHART_LEFT_WIDTH_RATIO/100);
        const [left_text_bboxes, spacing_left] = renderRelTexts(
            canvas_selector,
            leftcol_data,
            null,
            this.chart_height,
            token_chart_left_width,
            this.fontsize,
            true,
            onMouseOverLeftTokenInTokenChart,
            onMouseOutInTokenChart
        );

        // Stretch the container to fit all words if they don't fit due to minimum spacing constraint 
        // This is to activate the scrolling behaviour of the parent element
        const height_with_min_spacing = spacing_left * ((leftcol_data.length - 1) || 1) + (leftcol_data.length + 2) * this.fontsize
        tokenchart_left.style("height", height_with_min_spacing);

        // Draw links
        const all_link_strengths = this.right_links
            .concat(this.left_links)
            .map((l) => l.strength);

        tokenchart_left
            .selectAll(".token_links_contrast")
            .data(this.left_links)
            .enter()
            .append("line")
            .attr("class", "token_links_contrast")
            .attr("x1", Math.max(...left_text_bboxes.map((b) => b.width)) + 5)
            .attr("y1", (d) => left_text_bboxes[d.from].y + left_text_bboxes[d.from].height/2)
            .attr("x2", "95%")
            .attr("y2", (d) => right_col_ys[d.to] + right_col_heights[d.to]/2)
            .style("stroke", (d) => (d.strength > 0 ? "skyblue" : "pink"))
            .style(
                "stroke-width",
                (d) => 2 + 10 * normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
            )
            .style(
                "stroke-opacity",
                (d) => 0.1 + normalize_magnitude(all_link_strengths, Math.abs(d.strength)) ** 3
            );
        
        d3.selectAll(".token_links, .token_links_contrast")
            .on("mouseover", function (d) {
                d3.select("#rel_chart_tooltip")
                    .style("visibility", "visible")
                    .html(`
                        <div>Similarity between "${d.to_token}" and "${d.from_token}": ${d.strength.toFixed(3)}</div>
                        <div style="color:grey">Note: Similarity was computed with inner (dot) product</div>
                    `)
                    .style("top", event.pageY + 10 + "px")
                    .style("left", event.pageX + 10 + "px");
            })
            .on("mouseout", function (d) {
                d3.select("#rel_chart_tooltip").style("visibility", "hidden");
            });

        const topk = $(`${this.left_chart_container_selector.replace(".rel_chart_left", " ")} input.topk_tokenchart`).val();
        updateTokenLinks(parseInt(topk));
    }
}

/*
 * Helper functions
 */
function renderRelTexts(
    container_selector,
    data,
    all_importance,
    chart_height,
    chart_width,
    fontsize,
    is_left_col,
    onMouseOver,
    onMouseOut
) {
    const relchart = d3.select(container_selector);
    const spacing =
        Math.max(((chart_height-fontsize/2) - data.length * fontsize) / ((data.length - 1) || 1), MIN_TOKEN_SPACING);
    
    const text_anchor = is_left_col ? "start" : "end";
    const text_class = "text" + (is_left_col ? "_left" : "_right");
    const rect_class = "rect" + (is_left_col ? "_left" : "_right");
    const text_x = is_left_col ? 0 : chart_width;
    const rect_opacity = (d) =>
        d.importance ? 0.5 * normalize_magnitude(all_importance, Math.abs(d.importance)) : 0;

    let texts = relchart
        .selectAll(`.${text_class}`)
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
    const rects = relchart
        .selectAll(`.${rect_class}`)
        .data(data)
        .enter()
        .append("rect")
        .attr("class", `token_rect ${rect_class}`)
        .attr("width", (d) => bboxes[d.pos].width)
        .attr("height", (d) => bboxes[d.pos].height)
        .attr("x", (d) => bboxes[d.pos].x)
        .attr("y", (d) => bboxes[d.pos].y)
        .attr("fill", (d) => (d.importance > 0 ? "skyblue" : "pink"))
        .attr("fill-opacity", all_importance ? rect_opacity : 0);
    texts.remove();
    texts = relchart
        .selectAll(`.${text_class}`)
        .data(data)
        .enter()
        .append("text")
        .attr("text-anchor", text_anchor)
        .attr("class", `text_token ${text_class}`)
        .text((d) => d.token)
        .style("font-size", fontsize + "px")
        .attr("x", text_x + "px")
        .attr("y", (d) => (d.pos + 1) * fontsize + d.pos * spacing)
        .style("fill", "black")
        .on("mouseover", onMouseOver || onMouseOverRelChart)
        .on("mouseout", onMouseOut || onMouseOutRelChart)
        .on("click", function(d) {
            // on click, toggle the textIsClicked state of the rect underneath
            // if textIsClicked, disable all hover interactions of texts, else enable them back
            let disableHoverListeners = function() {
                d3.selectAll(`.text_token`)
                    .each(function(d) {
                        if (!d.disabledMouseover) d.disabledMouseover = d3.select(this).on("mouseover");
                        if (!d.disabledMouseout) d.disabledMouseout = d3.select(this).on("mouseout");
                    })
                    .on("mouseover", null)
                    .on("mouseout", null);
            }

            let reenableHoverListeners = function() {
                // clear all strokes and set back all the handlers
                d3.selectAll(`.token_rect`).attr("stroke", null);
                d3.selectAll(`.text_token`).each(function(d) {
                    d3.select(this)
                        .on("mouseover", d.disabledMouseover)
                        .on("mouseout",  d.disabledMouseout);
                });
            }

            const thisTextRect = rects.filter((rect_d) => rect_d.pos == d.pos);

            if (thisTextRect.attr("textIsClicked") != "true") {
                d3.selectAll(`.token_rect`).attr("textIsClicked", "false");
                thisTextRect.attr("textIsClicked", "true");

                // draw a stroke around the clicked text (clear all previous ones first)
                d3.selectAll(`.token_rect`).attr("stroke", null);
                thisTextRect
                    .attr("stroke", "red")
                    .attr("stroke-width", 2);

                // call the mouseover in case a user has clicked on another token without unclicking the first one
                (onMouseOut || onMouseOutRelChart)(d);
                (onMouseOver || onMouseOverRelChart)(d);

                disableHoverListeners();
            } else {
                thisTextRect.attr("textIsClicked", "false");
                reenableHoverListeners();
            }
        });

    return [bboxes, spacing];
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
            .style("top", d3.event.pageY + 10 + "px")
            .style("left", d3.event.pageX + 10 + "px");
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
    const topk = $(`#token-chart-container input.topk_tokenchart`).val();
    updateTokenLinks(parseInt(topk));
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

function updateRelLinks(topk) {
    filterRelLinks(".left_links", topk, "importance");
    filterRelLinks(".right_links", topk, "importance");
    filterRelLinks(".left_links_contrast", topk, "importance");
    filterRelLinks(".right_links_contrast", topk, "importance");
}

function updateTokenLinks(topk) {
    filterRelLinks(".token_links", topk, "strength");
    filterRelLinks(".token_links_contrast", topk, "strength");
}

function filterRelLinks(linkSelector, topk, byAttr) {
    const links = d3.selectAll(linkSelector).data();
    let values = links.map((l) => l[byAttr]);
    values = [...new Set(values)];
    values = values.sort((a,b) => Math.abs(b) - Math.abs(a));

    topk = Math.min(topk, values.length);
    const topk_value = (topk == null || topk == 0) ? Number.MAX_VALUE : values[topk - 1];

    d3.selectAll(linkSelector)
        .style("visibility", function(d) {
            if (Math.abs(d[byAttr]) >= Math.abs(topk_value)) {
                return "visible";
            } else {
                return "hidden";
            }
        });
}


export { 
    ImportanceView,
    Token2SimilarityRelationView,
    Token2TokenRelationView,
    updateTextSummary
}