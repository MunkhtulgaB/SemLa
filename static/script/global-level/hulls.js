function initializeHulls(data, cluster_to_color, 
                            intent_to_cluster, dim_reduction, X, Y) {
    // before drawing the points, draw polygonHulls around each intent group
    const intents_to_points_tsne = {};
    const intents_to_points_umap = {};

    data.forEach(function (d) {
        const x_pos_tsne = d[`tsne-dim0`];
        const y_pos_tsne = d[`tsne-dim1`];
        const x_pos_umap = d[`umap-dim0`];
        const y_pos_umap = d[`umap-dim1`];

        // save the locations for later
        if (!intents_to_points_tsne[d.ground_truth]) {
            intents_to_points_tsne[d.ground_truth] = [
                [x_pos_tsne, y_pos_tsne],
            ];
        } else {
            intents_to_points_tsne[d.ground_truth].push([
                x_pos_tsne,
                y_pos_tsne,
            ]);
        }

        if (!intents_to_points_umap[d.ground_truth]) {
            intents_to_points_umap[d.ground_truth] = [
                [x_pos_umap, y_pos_umap],
            ];
        } else {
            intents_to_points_umap[d.ground_truth].push([
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
        Y
    );

    return [intents_to_points_tsne, intents_to_points_umap]
}


function drawHulls(intents2points, cluster_to_color, 
                    intent_to_cluster, X, Y) {
    const polyHullsData = {};
    for (const intent in intents2points) {
        const pts = intents2points[intent];
        const hull = d3.polygonHull(pts);
        polyHullsData[intent] = hull;
    }

    d3.select("#scatter").selectAll("path.intentHull").remove();
    d3.select("#scatter").selectAll("path.intentHull")
        .data(Object.entries(polyHullsData))
        .enter()
        .append("path")
        .attr("class", "intentHull")
        .attr("d", function (d) {
            const [intent, pts] = d;
            const scaled_pts = pts.map(function (pt) {
                return [X(pt[0]), Y(pt[1])];
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


export { initializeHulls, drawHulls }
