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

    populate_html_confusion_table(confusion_table, onClick);

    // Add click event to header row
    $("#confusion-table th").click(function () {
        $(".selected-header").removeClass("selected-header");
        $(this).addClass("selected-header")
        const col_type = $(this).attr("column_type");
        toggleSortDirection(this);

        let sort_dir_gt = $("#confusion-table th[column_type=gt]").attr("sort_dir");
        let sort_dir_pred = $("#confusion-table th[column_type=pred]").attr("sort_dir");
        let sort_dir_num_confusions = $("#confusion-table th[column_type=num_confusions]").attr("sort_dir");

        sort_dir_gt = (sort_dir_gt == "asc") ? 1: -1;
        sort_dir_pred = (sort_dir_pred == "asc") ? 1: -1;
        sort_dir_num_confusions = (sort_dir_num_confusions == "asc") ? 1 : -1;


        if (col_type == "pred") {
            const confusion_table_pred_sorted = [...confusion_table];
            confusion_table_pred_sorted.sort(function (row1, row2) {
                return (sort_dir_pred * (pred_counts[row1[1]] - pred_counts[row2[1]]))
                        || (row1[1].localeCompare(row2[1]))
                        || (sort_dir_num_confusions * (row1[2] - row2[2]))
                        || (sort_dir_gt * (gt_counts[row1[0]] - gt_counts[row2[0]]))
                        || (row1[0].localeCompare(row2[0]));;
            }); 
            
            populate_html_confusion_table(confusion_table_pred_sorted,
                                            onClick);
        } else if (col_type == "gt") {
            const confusion_table_gt_sorted = [...confusion_table];
            confusion_table_gt_sorted.sort(function (row1, row2) {
                return (sort_dir_gt * (gt_counts[row1[0]] - gt_counts[row2[0]]))
                        || (row1[0].localeCompare(row2[0]))
                        || (sort_dir_num_confusions * (row1[2] - row2[2]))
                        || (sort_dir_pred * (pred_counts[row1[1]] - pred_counts[row2[1]]))
                        || (row1[1].localeCompare(row2[1]));
            });     
    
            populate_html_confusion_table(confusion_table_gt_sorted,
                                            onClick);
        } else if (col_type == "num_confusions") {
            const confusion_table_num_confusions_sorted = [...confusion_table];
            confusion_table_num_confusions_sorted.sort(function (row1, row2) {
                return (sort_dir_num_confusions * (row1[2] - row2[2]))
                        || (sort_dir_gt * (gt_counts[row1[0]] - gt_counts[row2[0]]))
                        || (row1[0].localeCompare(row2[0]))
                        || (sort_dir_pred * (pred_counts[row1[1]] - pred_counts[row2[1]]))
                        || (row1[1].localeCompare(row2[1]));
            });
            populate_html_confusion_table(confusion_table_num_confusions_sorted,
                                            onClick);
        }
    });

    $("#confusion-table th[column_type=num_confusions]").click();
}

function populate_html_confusion_table(data, onClick) {
    $("#confusion-table tr").not(":first").remove();
    let html = "";
    data.forEach(function (row) {
        const [gt, pred, num_confusions] = row;
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


function toggleSortDirection(headerElem) {
    const sort_dir = $(headerElem).attr("sort_dir");

    if (sort_dir == "desc") {
        $(headerElem).attr("sort_dir", "asc");
        $(headerElem).children(".sort-arrow").html("&uarr;");
    } else if (sort_dir == "asc") {
        $(headerElem).attr("sort_dir", "desc");
        $(headerElem).children(".sort-arrow").html("&darr;");
    }
}


function populateLabelTable(cluster_to_intent, 
                            cluster_to_color,
                            onChange) {                         
    const label_filter = $("#label_filter");
    label_filter.empty();

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
        label_filter.append(
            `<optgroup label="Cluster #${cluster}">${optgroup_content}</optgroup>`
        );
    });

    label_filter
        .click(function() {
            onChange(this);
        });
}

export { populateConfusionTable, populateLabelTable }