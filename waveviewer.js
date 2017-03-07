/*
 * Utils
 */

function style(element, styles) {
	for (var s in styles) {
		element.style[s] = styles[s];
	}
}

function WaveViewer(divID, data) {

    var waveviewer = this;
    this.colors = data['color'];
    this.data = data['data'];
    var num = Object.keys(this.data).length;
    var xdomain = data['xdomain'];
    var ydomain = data['ydomain'];
    var colormap;
    if (this.colors === undefined ) {
    colormap = d3.scale.quantize()
      .domain([0, num+3])
      .range(colorbrewer.Reds[num+3]);
    }
    var margin = {
      top: 40,
      right: 50,
      bottom: 60,
      left: 60
    }
    d3.select("#" + divID).html("");


    var svg;
    var svgGroup;
    var btn_width = 40;
    var btn_height = 20;
    var btn_defaultColor = "#6699CC";
    var btn_hoverColor   = "#0000ff";
    var btn_pressedColor = "#000077";

    svg = d3.select("#" + divID).append("svg")
        .attr("preserveAspectRatio", "none")
        .attr("height" , "100%")
        .attr("width" , "100%");
    svgGroup = svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    /*
     * Button
     */
    var buttonGroup = svg.append("g")
    var btn2D3D = buttonGroup.append('g')
        .attr("view","2D")
        .style("cursor","pointer")
        .attr("transform", "translate(-" + (10+btn_width) + ", 0)" )
        .on("mouseenter", function() {
            d3.select(this).select("rect").attr("fill",btn_hoverColor);
        })
        .on("mouseleave", function() {
            d3.select(this).select("rect").attr("fill",btn_defaultColor);
        })
        .on("click", function() {
            waveviewer.dispatch.toggle2D3D();
        })
    btn2D3D.append('rect')
        .attr('width', btn_width)
        .attr('height', btn_height)
        .attr("rx",5)
        .attr("ry",5)
        .attr("fill",btn_defaultColor)
        .attr("stroke",btn_hoverColor)
    btn2D3D.append('text')
        .attr('x', btn_width/2)
        .attr('y', btn_height/2)
        .attr("text-anchor","middle")
        .attr("dominant-baseline","central")
        .attr("fill","white")
        .text("3D")
    var btnUnpin = buttonGroup.append('g')
        .attr("view","2D")
        .attr("transform", "translate(-" + (2*10+2*btn_width) + ", 0)" )
        .style("cursor","pointer")
        .on("mouseenter", function() {
            d3.select(this).select("rect").attr("fill",btn_hoverColor);
        })
        .on("mouseleave", function() {
            d3.select(this).select("rect").attr("fill",btn_defaultColor);
        })
        .on("click", function() {
            waveviewer.dispatch.unpinAll();
        })
    btnUnpin.append('rect')
        .attr('width', btn_width)
        .attr('height', btn_height)
        .attr("rx",5)
        .attr("ry",5)
        .attr("fill",btn_defaultColor)
        .attr("stroke",btn_hoverColor)
    btnUnpin.append('text')
        .attr('x', btn_width/2)
        .attr('y', btn_height/2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("fill", "white")
        .text("unpin")
    buttonGroup.style("opacity", (num > 1) ? 1 : 0);

    var gridGroup = svgGroup.append("g")
        .style("opacity", 0);

    gridGroup.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "central")
        .attr("font-size",20);

    gridGroup.append("g")
        .attr("class", "xgrid axis")
        .style("fill","#222")
        .style("stroke","#444")

    gridGroup.append("g")
        .attr("class", "ygrid axis")
        .style("fill","none")
        .style("stroke","#444")

    svgGroup.append("g")
      .attr("class", "x axis")
      .style("fill","none")
      .style("stroke","#fff")
      .style("style", "opacity");

    svgGroup.append("g")
      .attr("class", "y axis")
      .style("fill","none")
      .style("stroke","#fff")

    svgGroup.append("g")
      .attr("class", "z axis")
      .style("fill","none")
      .style("stroke","#fff")

    svgGroup.append("path")
      .attr("class", "axis-frame")
      .style("fill","none")
      .style("stroke","#777")
      .style("opacity",0)

    var dot = null;

    var pinnedNum = 0;
    var line;
    var lines = {};
    var glance = {};
    var is3D = false;
    var highlighted;
    var x_gap, y_gap;
    var width_tot;
    var height_tot;
    var width_3d;
    var height_3d;
    var width;
    var height;

    id = 0
    for (idx in this.data) {
      var c;
      if (this.colors === undefined || this.colors[idx] === undefined)
          c = colormap(id);
      else
          c = this.colors[idx];
      lines[idx] = svgGroup.append("g")
          .attr("id", idx)
          .attr("color", c)
          .attr("index", id)
          .style("cursor","pointer")
          .on( "mouseenter", function(){
              var x = d3.select(this).attr("id")
              var i = d3.select(this).attr("index")
              waveviewer.dispatch.highlight(x, i);
          })
          .on( "mouseleave", function(){
              var x = d3.select(this).attr("id")
              waveviewer.dispatch.resume(x);
          })
          .on( "click", function(){
              var x = d3.select(this).attr("id");
              if (d3.select(this).classed('pinned')) {
                  waveviewer.dispatch.pin(x);
              } else {
                  waveviewer.dispatch.unpin(x)
              }
          })
      lines[idx].append("rect")
          .style('opacity', 0)
          .style("fill", c)
          .attr("rx", 5)
          .attr("ry", 5)
      lines[idx].append("text")
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "central")
          .attr("fill", "#000")
          .attr("font-size",12);
      lines[idx].append("path")
          .datum(this.data[idx])
          .attr("class", "line line" + idx)
          .style("stroke", c)
          .style("fill", "none")
      id++;
    }
    draw();

    this._pin = function(x) {
        lines[x].classed('pinned', false);
        --pinnedNum;
    }

    this._unpin = function(x) {
        lines[x].classed('pinned', true);
        ++pinnedNum;
    }

    this._unpinAll = function() {
        svgGroup.selectAll("g.pinned").classed('pinned', false);
        pinnedNum = 0;
        waveviewer.dispatch.resume();
    }

    this._highlight = function(x, id) {
        for(var idx in lines) {
            var val;
            if (idx === x) {
                val = 1;
                gridGroup.select("text")
                    .attr("fill", lines[idx].attr("color"))
                    .text(idx)
            } else
                val = (lines[idx].classed('pinned')) ? 0.8 : 0.15;
            lines[idx].style("opacity", val);
        }
        gridGroup
            .attr( "transform", "translate("+ (x_gap*(num-1-id)) +","+ (-y_gap*(num-1-id)) + ")")
            .style("opacity",1);
    }
    this._resume = function(x) {
        if (x === undefined || svgGroup.select("g.pinned").empty())
            for(var idx in lines)
                lines[idx].style("opacity", 1);
        else {
            var val = (lines[x].classed('pinned')) ? 0.8 : 0.15;
            lines[x].style("opacity", val);
        }
        gridGroup.style("opacity",0);
    }
    function draw() {
        var num = Object.keys(lines).length;
        var boxRect = d3.select("#" + divID).node().getBoundingClientRect()
        width_tot = boxRect.width - margin.left - margin.right;
        height_tot = boxRect.height - margin.top - margin.bottom;
        width_3d = Math.floor( width_tot*is3D/5 );
        height_3d = Math.floor( height_tot*is3D/5 );
        width = width_tot - width_3d;
        height = height_tot - height_3d;

        svg.attr("viewBox", '0 0 ' + boxRect.width + ' ' + boxRect.height)
        buttonGroup.attr("transform", "translate(" + (width_tot+margin.right+margin.left) + ", 10)" );

        var x = d3.scale.linear()
          .range([0, width]).domain([0, xdomain]);

        var y = d3.scale.linear()
          .range([height_tot, height_3d]).domain([0, ydomain]);

        var xAxis = d3.svg.axis() //.Bottom(x)
          .scale(x)
          .orient("bottom");

        var yAxis = d3.svg.axis() //Left(y)
          .scale(y)
          .orient("left");

        line = d3.svg.line()
          .x(function(d) {
            return x(d[0]);
          })
          .y(function(d) {
            return y(d[1]);
          });

        svgGroup.select(".x.axis").transition().duration(1000)
          .call(xAxis)
          .attr("transform", "translate(-0.1," + height_tot + ")");

        svgGroup.select(".y.axis").transition().duration(1000)
          .call(yAxis);

        /* Force D3 to recalculate and update the line */
        for (idx in lines) {
            lines[idx].select('path').transition().duration(1000).attr("d",line);
        }
        var xGridAxis = d3.svg.axis() //.Bottom(x)
            .scale(x)
            .orient("bottom")
            .innerTickSize(-height)
            .outerTickSize(0)
            .tickPadding(10);


        var yGridAxis = d3.svg.axis() //Left(y)
            .scale(y)
            .orient("right")
            .innerTickSize(-width)
            .outerTickSize(0)
            .tickPadding(10);

        gridGroup.select(".xgrid.axis")
            .call(xGridAxis)
            .attr("transform", "translate(-0.1," + height_tot + ")");
        gridGroup.select(".ygrid.axis")
            .call(yGridAxis)
            .attr("transform", "translate(" + width + ", 0)");
        gridGroup.select("text")
            .attr('x', width/2)
            .attr('y', height_3d-15);

        x_gap = (num == 1 || !is3D) ? 0 : width_3d / (num-1);
        y_gap = (num == 1 || !is3D) ? 0 : height_3d / (num-1);
        if (is3D) {

            var z = d3.scale.linear()
                .range([height_tot, height_tot-Math.sqrt(width_3d*width_3d+height_3d*height_3d)]).domain([0, num-1]);

            var zAxis = d3.svg.axis().tickFormat("")
                .scale(z)
                .orient("left");

            var ang = Math.floor(Math.atan( width_3d / height_3d ) * 180 / Math.PI);

            svgGroup.select(".z.axis")
                .style("opacity", 1)
                .call(zAxis).transition().duration(1000)
                .attr( "transform", "rotate(" + ang  + " 0 " + height_tot  + ")");

            svgGroup.select(".axis-frame")
                .transition(1000).duration(1000)
                .attr("d", "M 0 " + height_3d + " " +
                           "L " + width_3d + " 0" +
                           "L " + width_3d + " " + height +
                           "L " + width_tot + " " + height +
                           "L " + width + " " + height_tot)
                .style("opacity", 1);
            for (idx in lines) {
                lines[idx].select('rect').transition(1000).duration(1000)
                    .attr('x', width + 10)
                    .attr('y', 5+height_tot)
                    .attr('width', margin.right-20)
                    .attr('height', margin.bottom-10)
                    .style('opacity', 1)
                lines[idx].select('text')
                    .text(idx)
                    .transition(1000).duration(1000)
                    .attr('x', width+margin.right/2)
                    .attr('y', height_tot+margin.bottom/2)
                    .attr("transform", "rotate(90 " + (width+margin.right/2) + " " + (height_tot+margin.bottom/2) + ")")
                    .style('opacity', 1)
            }

        } else {
            svgGroup.select(".z.axis")
              .transition().duration(1000)
              .style("opacity", 0)
              .attr( "transform", "rotate(" + 0 + " 0 " + height_tot  + ")");;

            svgGroup.select(".axis-frame")
                .attr("d", "" )
                .transition().duration(1000)
                .style("opacity", 0);
            for (idx in lines) {
                lines[idx].select('rect').transition(1000).duration(1000)
                    .style('opacity', 0)
                lines[idx].select('text').transition(1000).duration(1000)
                    .style('opacity', 0)
            }
        }
        i = 0;
        for (idx in lines) {
            lines[idx].transition(1000).duration(1000).attr( "transform", "translate("+ (x_gap*(num-1-i)) +","+ (-y_gap*(num-1-i)) + ")");
            ++i;
        }
    }

    function play(index) {
        if (dot === null) {
            dot = svg.append("circle")
              .style("fill", "red")
              .attr("r", 0)
              .attr("cx", 0)
              .attr("cy", 0);
        }

        for (idx in this.data) {
          var i = index
          if (i >= this.data[idx].length )
              i = this.data[idx].length-1;
          glance[idx] = (pinnedNum > 0 && !lines[idx].classed('pinned')) ? 0 : this.data[idx][i][1];
          lines[idx].select('path')
            .datum(this.data[idx].slice(0,i+1)) // set the new data
            .attr("d", line) // apply the new data values ... but the new value is hidden at this point off the right of the canvas
            .transition() // start a transition to bring the new value into view
            .ease("linear")
            .duration(1) // for this demo we want a continual slide so set this to the same as the setInterval amount below
        }
        if (this.dispatch.play_hook != undefined) {
            this.dispatch.play_hook(glance);
        }
        //dot.attr('transform', 'translate(' + x(this.data[0][index][0]) + ',' + y(this.data[0][index][1]) + ')');
    }
    function stop() {
        if (dot != null) {
            dot.remove();
            dot = null;
        }
        for (idx in this.data)
          lines[idx].select('path').datum(this.data[idx]).attr("d", line);
        if (this.dispatch.stop_hook != undefined) {
            this.dispatch.stop_hook(glance);
        }
    }
    this._toggle2D3D = function() {
        btn2D3D.select('text').text(btn2D3D.attr("view"))
        if (btn2D3D.attr("view") === "2D") {
            btn2D3D.attr("view", "3D");
            is3D = true;
        } else {
            btn2D3D.attr("view", "2D");
            is3D = false;
        }
        draw();
    }
    this.play = play.bind(this);
    this.stop = stop.bind(this);
    this.dispatch = {
        'pin': this._pin,
        'unpin': this._unpin,
        'resume': this._resume,
        'unpinAll': this._unpinAll,
        'highlight': this._highlight,
        'toggle2D3D': this._toggle2D3D,
        'play_hook': undefined,
        'stop_hook': undefined,
    }
}
