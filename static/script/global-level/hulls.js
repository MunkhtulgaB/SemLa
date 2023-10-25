function initializeHulls(data, cluster_to_color, 
                            intent_to_cluster, dim_reduction, X, Y, byGoldLabel) {
    // before drawing the points, draw polygonHulls around each intent group
    const intents_to_points_tsne = {};
    const intents_to_points_umap = {};

    data.forEach(function (d) {
        const x_pos_tsne = d[`tsne-dim0`];
        const y_pos_tsne = d[`tsne-dim1`];
        const x_pos_umap = d[`umap-dim0`];
        const y_pos_umap = d[`umap-dim1`];

        const label = (byGoldLabel) ? d.ground_truth : d.prediction;
        // save the locations for later
        if (!intents_to_points_tsne[label]) {
            intents_to_points_tsne[label] = [
                [x_pos_tsne, y_pos_tsne],
            ];
        } else {
            intents_to_points_tsne[label].push([
                x_pos_tsne,
                y_pos_tsne,
            ]);
        }

        if (!intents_to_points_umap[label]) {
            intents_to_points_umap[label] = [
                [x_pos_umap, y_pos_umap],
            ];
        } else {
            intents_to_points_umap[label].push([
                x_pos_umap,
                y_pos_umap,
            ]);
        }
    });

    drawHulls(
        dim_reduction == "tsne" ? intents_to_points_tsne : intents_to_points_umap,
        cluster_to_color,
        intent_to_cluster,
        X, 
        Y,
        byGoldLabel
    );

    return [intents_to_points_tsne, intents_to_points_umap]
}


function drawHulls(labels2points, cluster_to_color, 
                    label_to_cluster, X, Y, byGoldLabel) {
    const polyHullsData = {};
    for (const label in labels2points) {
        const pts = labels2points[label];
        if (pts.length < 3) {
            for (let i = 0; i < 3 - pts.length; i++) {
                pts.push(pts[0]);
            }
        }
        const hull = d3.polygonHull(pts);
        polyHullsData[label] = hull;
    }

    const hullClass = (byGoldLabel) ? "goldLabelHull" : "predictedLabelHull";

    d3.select(".scatter").selectAll("path." + hullClass).remove();
    d3.select(".scatter").selectAll("path." + hullClass)
        .data(Object.entries(polyHullsData))
        .enter()
        .append("path")
        .attr("class", hullClass + " labelHull")
        .attr("d", function (d) {
            const [intent, pts] = d;
            const scaled_pts = pts.map(function (pt) {
                return [X(pt[0]), Y(pt[1])];
            });
            return `M${scaled_pts.join("L")}Z`;
        })
        .style("stroke", "lightblue")
        .style("stroke-width", 3)
        .attr("stroke-dasharray", (byGoldLabel) ? "4": "")
        .style("fill-opacity", (byGoldLabel) ? "0.4" : "0.4")
        .style("fill", function (d) {
            const [label, pts] = d;
            return cluster_to_color[label_to_cluster[label]];
        })
        .attr("visibility", "hidden")
        .style("pointer-events", "none");
}


export { initializeHulls, drawHulls }
