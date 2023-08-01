function populateConfusionTable(confusions, 
                                gt_counts, 
                                pred_counts,
                                onClick) {
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
        $(".error_tr").click(onClick);
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
}


function populateIntentTable(cluster_to_intent, 
                            cluster_to_color,
                            onChange) {
    const intent_filter = $("#intent_filter");

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
        .change(onChange)
        .click(onChange);
}

export { populateConfusionTable, populateIntentTable }