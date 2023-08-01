import { initializeTooltip, 
    hideTooltip, 
    showTooltip,
    moveTooltipToCursor } from "./tooltip.js";
import { initializeHulls } from "./hulls.js";
    

let newX;
let newY;


function initializeDragging(dim_reduction, onDragEnd, dataset_name) {
    // Create a dragging behaviour
    let current_dragline;
    let drag = d3
    .drag()
    .on("start", function (d) {
        const [x, y] = getPosition(this);
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
            const [x2, y2] = getPosition(mouseover_dp.node());
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
            onDragEnd(idx1, idx2, dataset_name);
        }
   });
   return drag;
}


function getPosition(dp_element) {
    return [
        dp_element.transform.baseVal[0].matrix.e,
        dp_element.transform.baseVal[0].matrix.f,
    ];
}


function initializeZoom(svg_canvas, 
                        margin, 
                        width, 
                        height, 
                        x, 
                        y, 
                        xAxis, 
                        yAxis, 
                        dim_reduction, 
                        onZoom) {
   // Set the zoom and Pan features: how much you can zoom, on which part, and what to do when there is a zoom
   let zoom = d3
   .zoom()
   .scaleExtent([0.5, 100]) // This control how much you can unzoom (x0.5) and zoom (x20)
   .extent([
       [0, 0],
       [width, height],
   ])
   .on("zoom", () => updateChart(x, y, xAxis, yAxis, 
                                dim_reduction, onZoom))
   .on("start", function () {
       d3.select("#scatter").selectAll(".local_word").remove();
   })
   .on("end", onZoom);
   
   // This add an invisible rect on top of the chart area. This rect can recover pointer events: necessary to understand when the user zoom
   svg_canvas.append("rect")
   .attr("width", width)
   .attr("height", height)
   .style("fill", "none")
   .style("pointer-events", "all")
   .attr("transform", "translate(" + margin.left + "," + margin.top + ")")
   .call(zoom);    
}



// A function that updates the chart when the user zoom and thus new boundaries are available
function updateChart(x, y, xAxis, yAxis, dim_reduction, onZoom) {
    // recover the new scale
    newX = d3.event.transform.rescaleX(x);
    newY = d3.event.transform.rescaleY(y);

    // update axes with these new boundaries
    xAxis.call(d3.axisBottom(newX));
    yAxis.call(d3.axisLeft(newY));

    updatePositions(newX, newY, dim_reduction);

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
    onZoom();
}


function updatePositions(xScale, yScale, dim_reduction) {
    // update positions
    d3.selectAll("path.datapoint").attr("transform", function (d) {
        const translation =
            "translate(" +
            xScale(d[`${dim_reduction}-dim0`]) +
            "," +
            yScale(d[`${dim_reduction}-dim1`]) +
            ")";
        return translation;
    });
    // update hulls
    d3.selectAll("path.intentHull").attr("d", function (d) {
        const [intent, pts] = d;
        const scaled_hull = pts.map((pt) => [xScale(pt[0]), yScale(pt[1])]);
        return `M${scaled_hull.join("L")}Z`;
    });
}


function initializeMap(svg_canvas, 
                        margin,
                        width, 
                        height, 
                        data, 
                        cluster_to_color, 
                        intent_to_cluster,
                        dim_reduction,
                        onZoom,
                        onClick,
                        onDragEnd,
                        dataset_name) {
   // Initialize axes
   const [x, y] = getXYScales(data, dim_reduction, width, height);
   let xAxis = svg_canvas.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x));
   let yAxis = svg_canvas.append("g").call(d3.axisLeft(y));

   newX = x;
   newY = y;

   // Initialize zoom
   initializeZoom(svg_canvas, 
                    margin, 
                    width, 
                    height, 
                    x, 
                    y, 
                    xAxis, 
                    yAxis, 
                    dim_reduction,
                    onZoom);

   // Create the scatter plot
   let scatter = svg_canvas.append("g")
                   .attr("id", "scatter")
                   .attr("clip-path", "url(#clip)");

   // Initialize dragging behaviour and intent hulls
   const drag = initializeDragging(dim_reduction, onDragEnd, dataset_name);
   const [intents_to_points_tsne, intents_to_points_umap] = initializeHulls(data, cluster_to_color, intent_to_cluster, 
                   dim_reduction, newX, newY);

   // Draw the points
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
   .on("mouseover", showTooltip)
   .on("mousemove", moveTooltipToCursor)
   .on("mouseout", hideTooltip)
   .on("click", function(d) {
       onClick.bind(this)(d, data, newX, newY);
   })
   .call(drag);

   initializeTooltip();
   return [intents_to_points_tsne, intents_to_points_umap]
}


function getXYScales(data, dim_reduction, width, height) {
    const xMin = Math.min(...data.map((d) => d[`${dim_reduction}-dim0`]));
    const xMax = Math.max(...data.map((d) => d[`${dim_reduction}-dim0`]));
    const xRange = xMax - xMin;

    const yMin = Math.min(...data.map((d) => d[`${dim_reduction}-dim1`]));
    const yMax = Math.max(...data.map((d) => d[`${dim_reduction}-dim1`]));
    const yRange = yMax - yMin;

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


export { initializeMap, getXYScales, updatePositions }








