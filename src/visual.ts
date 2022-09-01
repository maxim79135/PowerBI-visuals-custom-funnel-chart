/*
 *  Power BI Visual CLI
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */
"use strict";

import "core-js/stable";
import "./../style/funnel.less";
import powerbi from "powerbi-visuals-api";

import * as d3 from "d3";
import { ScaleBand, scaleBand, ScaleLinear, scaleLinear } from "d3-scale";
import { BaseType, select, Selection } from "d3-selection";
const getEvent = () => require("d3-selection").event;

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import VisualObjectInstanceEnumeration = powerbi.VisualObjectInstanceEnumeration;
import TextProperties = interfaces.TextProperties;

import {
  textMeasurementService,
  interfaces,
} from "powerbi-visuals-utils-formattingutils";

import { FunnelChartSettings } from "./settings";
import {
  IFunnelChartViewModel,
  IDataPoint,
  IStatusPoint,
} from "./model/ViewModel";
import { visualTransform } from "./model/ViewModelHelper";
import { ColorHelper } from "powerbi-visuals-utils-colorutils";

export class FunnelChart implements IVisual {
  // TODO Replace to settings
  private static Config = {
    barPadding: 0.1,
    outerPadding: 0.05,
    xScalePadding: 0,
    degree: 40,
    statusBarPadding: 10,
  };

  private settings: FunnelChartSettings;
  private host: IVisualHost;
  private model: IFunnelChartViewModel;

  private width: number;
  private height: number;
  private stageScale: ScaleBand<string>;

  private svg: Selection<SVGElement, {}, HTMLElement, any>;
  private emptyRectContainer: Selection<SVGElement, {}, HTMLElement, any>;
  private divContainer: Selection<SVGElement, {}, HTMLElement, any>;
  private funnelContainer: Selection<SVGElement, {}, HTMLElement, any>;

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;

    let svg = (this.svg = select(options.element)
      .append<SVGElement>("div")
      .classed("divContainer", true)
      .append<SVGElement>("svg")
      .classed("funnelChart", true));

    this.funnelContainer = svg
      .append<SVGElement>("g")
      .classed("funnelContainer", true);

    this.emptyRectContainer = this.funnelContainer
      .append<SVGElement>("rect")
      .classed("rect-container", true);
    this.emptyRectContainer.attr("fill", "transparent");

    this.divContainer = select(".divContainer");
  }

  public update(options: VisualUpdateOptions) {
    this.model = visualTransform(options, this.host);
    console.log(this.model);

    this.width = options.viewport.width;
    this.height = options.viewport.height;

    this.updateViewport(options);
    this.drawFunnelChart();
  }

  public updateViewport(options: VisualUpdateOptions) {
    let h = options.viewport.height + 5;
    let w = options.viewport.width;

    // update size canvas
    this.divContainer.attr(
      "style",
      "width:" + w + "px;height:" + h + "px;overflow-y:auto;overflow-x:hidden;"
    );

    this.stageScale = scaleBand()
      .domain(this.model.dataPoints.map((d) => <string>d.stageName))
      .rangeRound([5, this.height])
      .padding(FunnelChart.Config.barPadding)
      .paddingOuter(FunnelChart.Config.outerPadding);

    // update sizes
    this.svg.attr("width", this.width);
    this.svg.attr("height", this.height);
    this.emptyRectContainer.attr("width", this.width);
    this.emptyRectContainer.attr("height", this.height);
  }

  private drawFunnelChart() {
    let stages = this.funnelContainer
      .selectAll("g.stage-container")
      .data(this.model.dataPoints);
    stages
      .enter()
      .append<SVGElement>("g")
      .classed("stage-container", true)
      .attr("id", (d) => `stage-container-${d.id}`)
      .attr("x", FunnelChart.Config.xScalePadding) // .merge(bars)
      .attr("y", (d) => this.stageScale(<string>d.stageName))
      .attr("height", this.stageScale.bandwidth())
      .attr("width", (d) => this.width);
    stages.exit().remove();

    this.drawStageLabels();
    this.drawFunnel();
  }

  private drawStageLabels() {
    let settings = this.model.settings.stageLabel;
    let stages = this.funnelContainer
      .selectAll("g.stage-container")
      .data(this.model.dataPoints);

    let labels = stages.selectAll("text.stage-label").data((d) => [d]);
    let mergeElement = labels
      .enter()
      .append<SVGElement>("text")
      .classed("stage-label", true);
    labels
      .merge(mergeElement)
      .each((d) => {
        let textProperties: TextProperties = {
          fontFamily: settings.fontFamily,
          fontSize: settings.textSize + "pt",
          text: <string>d.stageName,
        };
        let maxTextProperties: TextProperties = {
          fontFamily: settings.fontFamily,
          fontSize: settings.textSize + "pt",
          text: <string>this.model.maxStageName,
        };
        let width = Math.min(
          textMeasurementService.measureSvgTextWidth(maxTextProperties),
          (this.width * settings.maxWidth) / 100
        );
        d.x2 = width;
        d.formattedStageName = textMeasurementService.getTailoredTextOrDefault(
          textProperties,
          Math.round(width)
        );
      })
      .attr("x", (d) => {
        let textProperties: TextProperties = {
          fontFamily: settings.fontFamily,
          fontSize: settings.textSize + "pt",
          text: <string>d.formattedStageName,
        };
        return (
          d.x2 - textMeasurementService.measureSvgTextWidth(textProperties)
        );
      })
      .attr(
        "y",
        (d) =>
          this.stageScale(<string>d.stageName) + this.stageScale.bandwidth() / 2
      )
      .attr("heigh", this.stageScale.bandwidth())
      .style("font-size", settings.textSize + "pt")
      .style("font-family", settings.fontFamily)
      .style("font-weight", settings.isBold ? "bold" : "")
      .style("font-style", settings.isItalic ? "italic" : "")
      .style("fill", settings.color)
      .text((d) => <string>d.formattedStageName);

    labels.exit().remove();
  }

  private drawFunnel() {
    let data = this.model.dataPoints;
    let stages = this.funnelContainer
      .selectAll("g.stage-container")
      .data(this.model.dataPoints);
    let statusContainer = stages
      .selectAll("g.status-container")
      .data((d) => [d]);
    let mergeElement = statusContainer
      .enter()
      .append<SVGElement>("g")
      .classed("status-container", true);
    statusContainer
      .merge(mergeElement)
      .attr("id", (d) => `status-container-${d.id}`);

    data.forEach((stage, index) => {
      let statusContainer = this.funnelContainer.select(
        `#status-container-${index}`
      );

      let statusBar = statusContainer
        .selectAll("rect.status-bar")
        .data(stage.statusPoints);
      let mergeStatus = statusBar
        .enter()
        .append("rect")
        .classed("status-bar", true);
      const statusBarTopY = this.stageScale(<string>stage.stageName);
      let width =
        this.width -
        stage.x2 -
        2 *
          Math.tan((FunnelChart.Config.degree * Math.PI) / 180) *
          statusBarTopY -
        2 * FunnelChart.Config.statusBarPadding;
      statusBar
        .merge(mergeStatus)
        .attr("x", (this.width + stage.x2) / 2 - width / 2)
        .attr("y", statusBarTopY)
        .attr("width", width)
        .attr("height", this.stageScale.bandwidth())
        .style("fill", "#0B3E9A");

      statusBar.exit().remove();
    });

    statusContainer.exit().remove();
  }

  public enumerateObjectInstances(
    options: EnumerateVisualObjectInstancesOptions
  ): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
    const instances = FunnelChartSettings.enumerateObjectInstances(
      this.model.settings,
      options
    );
    const objectName = options.objectName;

    switch (objectName) {
      case "stageLabel":
        this.addAnInstanceToEnumeration(instances, {
          objectName,
          properties: {
            maxWidth: this.model.settings.stageLabel.maxWidth,
          },
          selector: null,
          validValues: {
            maxWidth: {
              numberRange: {
                min: 15,
                max: 50,
              },
            },
          },
        });
        break;

      case "dataColors":
        if (!this.model.settings.dataColors.showAll) break;
        
        this.model.dataPoints.forEach((dataPoint) => {
          dataPoint.statusPoints.forEach((statusPoint) => {
            this.addAnInstanceToEnumeration(instances, {
              displayName: <string>statusPoint.statusName,
              objectName: objectName,
              properties: {
                color: statusPoint.color,
              },
              selector: ColorHelper.normalizeSelector(
                statusPoint.selectionId.getSelector(),
                false
              ),
            });
          });
        });
        break;
    }
    return instances;
  }

  private addAnInstanceToEnumeration(
    instanceEnumeration: VisualObjectInstanceEnumeration,
    instance: VisualObjectInstance
  ): void {
    if (
      (<VisualObjectInstanceEnumerationObject>instanceEnumeration).instances
    ) {
      (<VisualObjectInstanceEnumerationObject>(
        instanceEnumeration
      )).instances.push(instance);
    } else {
      (<VisualObjectInstance[]>instanceEnumeration).push(instance);
    }
  }
}
