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
import "regenerator-runtime/runtime";
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
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;

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
import {
  createTooltipServiceWrapper,
  ITooltipServiceWrapper,
  TooltipEventArgs as ITooltipEventArgs,
} from "powerbi-visuals-utils-tooltiputils";

export class FunnelChart implements IVisual {
  // TODO Replace to settings
  private static Config = {
    barPadding: 0.1,
    outerPadding: 0.05,
    xScalePadding: 0,
    degree: 40,
    statusBarMargin: 10,
    maxHeightScale: 3,
  };

  private host: IVisualHost;
  private model: IFunnelChartViewModel;
  private tooltipServiceWrapper: ITooltipServiceWrapper;
  private selectionManager: ISelectionManager;

  private width: number;
  private height: number;
  private stageScale: ScaleBand<string>;

  private svg: Selection<SVGElement, {}, HTMLElement, any>;
  private emptyRectContainer: Selection<SVGElement, {}, HTMLElement, any>;
  private divContainer: Selection<SVGElement, {}, HTMLElement, any>;
  private funnelContainer: Selection<SVGElement, {}, HTMLElement, any>;

  constructor(options: VisualConstructorOptions) {
    this.host = options.host;
    this.tooltipServiceWrapper = createTooltipServiceWrapper(
      options.host.tooltipService,
      options.element
    );
    this.selectionManager = options.host.createSelectionManager();

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

    this.tooltipServiceWrapper.addTooltip(
      this.funnelContainer.selectAll("rect.status-bar"),
      (tooltipEvent: IStatusPoint) => this.getTooltipData(tooltipEvent),
      (tooltipEvent: IStatusPoint) => tooltipEvent.selectionId
    );
    this.tooltipServiceWrapper.addTooltip(
      this.funnelContainer.selectAll("text.status-label"),
      (tooltipEvent: IStatusPoint) => this.getTooltipData(tooltipEvent),
      (tooltipEvent: IStatusPoint) => tooltipEvent.selectionId
    );

    this.synSelections();
    this.addContextMenu();
  }

  public updateViewport(options: VisualUpdateOptions) {
    let h = options.viewport.height + 5;
    let w = options.viewport.width;

    // update size canvas
    this.divContainer.attr(
      "style",
      "width:" + w + "px;height:" + h + "px;overflow-y:auto;overflow-x:auto;"
    );

    let height = options.viewport.height * 0.95;
    let xScaledMax = height / FunnelChart.Config.maxHeightScale;
    let xScaledMin = this.model.settings.funnel.minBarHeight;
    let outerPadding = -FunnelChart.Config.outerPadding;

    // calcX is the calculated height of the bar+inner padding that will be required if we simply
    // distribute the height with the bar count (no scrolling)
    let calcX =
      this.height /
      (2 * FunnelChart.Config.outerPadding -
        FunnelChart.Config.xScalePadding +
        this.model.dataPoints.length);

    // calcHeight is the height required for the entire bar chart
    // if min allowed bar height is used. (This is needed for setting the scroll height)
    let calcHeight =
      (-2 * outerPadding -
        FunnelChart.Config.xScalePadding +
        this.model.dataPoints.length) *
      xScaledMin;

    if (calcX > xScaledMax) {
      if (xScaledMax >= xScaledMin) {
        let tempouterPadding =
          (height -
            (-FunnelChart.Config.xScalePadding + this.model.dataPoints.length) *
              xScaledMax) /
          (2 * xScaledMax);
        if (tempouterPadding > 0) {
          outerPadding = tempouterPadding;
        }
      } else {
        let tempOuterPadding =
          (height -
            (-FunnelChart.Config.xScalePadding + this.model.dataPoints.length) *
              xScaledMin) /
          (2 * xScaledMin);
        if (tempOuterPadding > 0) {
          outerPadding = tempOuterPadding;
        }
      }
    } else {
      if (calcX < xScaledMin && calcHeight > height) {
        height = calcHeight;
      }
    }

    let stageSettings = this.model.settings.stageLabel;
    let stageTextProperties: TextProperties = {
      fontFamily: stageSettings.fontFamily,
      fontSize: stageSettings.textSize + "pt",
      text: <string>this.model.maxStageName,
    };
    let width = Math.min(
      textMeasurementService.measureSvgTextWidth(stageTextProperties),
      (this.width * stageSettings.maxWidth) / 100
    );
    width = Math.ceil(width) + 5;
    let stageLabelWidth = width + stageSettings.margin;

    let valueSettings = this.model.settings.valueLabel;
    let valueTextProperties: TextProperties = {
      fontFamily: valueSettings.fontFamily,
      fontSize: valueSettings.textSize + "pt",
      text: <string>this.model.maxValueLabel,
    };
    width = Math.min(
      textMeasurementService.measureSvgTextWidth(valueTextProperties),
      (this.width * valueSettings.maxWidth) / 100
    );

    let valueLabelWidth = width + valueSettings.margin;
    let funnelWidth =
      ((this.width - stageLabelWidth - valueLabelWidth) * 100) /
      this.model.settings.funnel.scale;
    let calcWidth = stageLabelWidth + valueLabelWidth + funnelWidth;

    if (calcWidth > w) {
      this.width = calcWidth;
    }

    this.stageScale = scaleBand()
      .domain(this.model.dataPoints.map((d) => <string>d.stageName))
      .rangeRound([5, height])
      .padding(this.model.settings.funnel.verticalBarPadding / 100)
      .paddingOuter(outerPadding);

    // update sizes
    console.log(this.width, height);

    this.svg.attr("width", this.width);
    this.svg.attr("height", height);
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
    this.drawValueLabels();
    this.drawFunnel();
  }

  private drawStageLabels() {
    const settings = this.model.settings.stageLabel;
    const inverted = this.model.settings.funnel.invertStagePosition;
    let stages = this.funnelContainer
      .selectAll("g.stage-container")
      .data(this.model.dataPoints);

    // calc x1 coord
    let maxTextProperties: TextProperties = {
      fontFamily: settings.fontFamily,
      fontSize: settings.textSize + "pt",
      text: <string>this.model.maxStageName,
    };
    let width = Math.min(
      textMeasurementService.measureSvgTextWidth(maxTextProperties),
      (this.width * settings.maxWidth) / 100
    );
    width = Math.ceil(width) + 5;
    this.model.statusBarX1 = width + settings.margin;
    if (inverted) {
      [this.model.statusBarX1, this.model.statusBarX2] = [
        width + settings.margin,
        this.width - width - settings.margin,
      ];
    }

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
        d.formattedStageName = textMeasurementService.getTailoredTextOrDefault(
          textProperties,
          width
        );
      })
      .attr("dominant-baseline", "middle")
      .attr("x", (d) => {
        let textProperties: TextProperties = {
          fontFamily: settings.fontFamily,
          fontSize: settings.textSize + "pt",
          text: <string>d.formattedStageName,
        };
        if (inverted) {
          return this.model.statusBarX2;
        } else {
          return (
            this.model.statusBarX1 -
            textMeasurementService.measureSvgTextWidth(textProperties)
          );
        }
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

  private drawValueLabels() {
    const settings = this.model.settings.valueLabel;
    const inverted = this.model.settings.funnel.invertStagePosition;

    let stages = this.funnelContainer
      .selectAll("g.stage-container")
      .data(this.model.dataPoints);
    stages.selectAll("text.value-label").remove();

    // calc x2 coord
    let maxTextProperties: TextProperties = {
      fontFamily: settings.fontFamily,
      fontSize: settings.textSize + "pt",
      text: <string>this.model.maxValueLabel,
    };
    let width = Math.min(
      textMeasurementService.measureSvgTextWidth(maxTextProperties),
      (this.width * settings.maxWidth) / 100
    );

    this.model.statusBarX2 = this.width - width - settings.margin;
    if (!settings.show) this.model.statusBarX2 = this.width - settings.margin;
    if (inverted) {
      [this.model.statusBarX1, this.model.statusBarX2] = [
        width + settings.margin,
        this.width - this.model.statusBarX1,
      ];
      if (!settings.show) this.model.statusBarX1 = settings.margin;
    }
    console.log(this.model.statusBarX1, this.model.statusBarX2);

    if (settings.show) {
      let labels = stages.selectAll("text.value-label").data((d) => [d]);
      let mergeElement = labels
        .enter()
        .append<SVGElement>("text")
        .classed("value-label", true);
      labels
        .merge(mergeElement)
        .each((d) => {
          let textProperties: TextProperties = {
            fontFamily: settings.fontFamily,
            fontSize: settings.textSize + "pt",
            text: <string>d.formattedSumStatus,
          };

          d.formattedSumStatus =
            textMeasurementService.getTailoredTextOrDefault(
              textProperties,
              Math.ceil(width)
            );
        })
        .attr("dominant-baseline", "middle")
        .attr("x", (d) => {
          let textProperties: TextProperties = {
            fontFamily: settings.fontFamily,
            fontSize: settings.textSize + "pt",
            text: <string>d.formattedSumStatus,
          };
          if (inverted) {
            return (
              this.model.statusBarX1 -
              textMeasurementService.measureSvgTextWidth(textProperties)
            );
          } else {
            return this.model.statusBarX2;
          }
        })
        .attr(
          "y",
          (d) =>
            this.stageScale(<string>d.stageName) +
            this.stageScale.bandwidth() / 2
        )
        .attr("heigh", this.stageScale.bandwidth())
        .style("font-size", settings.textSize + "pt")
        .style("font-family", settings.fontFamily)
        .style("font-weight", settings.isBold ? "bold" : "")
        .style("font-style", settings.isItalic ? "italic" : "")
        .style("fill", settings.color)
        .text((d) => <string>d.formattedSumStatus);
    }
  }

  private drawFunnel() {
    const settings = this.model.settings.funnel;
    const statusSettings = this.model.settings.status;
    let degree = settings.degree;
    const data = this.model.dataPoints;

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

    // calc funnel degree
    const stage = data.at(-1);
    const statusBarY = this.stageScale(<string>stage.stageName);
    const offsetX =
      Math.tan((degree * Math.PI) / 180) * statusBarY + settings.margin;
    let funnelWidth = this.model.statusBarX2 - this.model.statusBarX1;
    let minBarWidth = funnelWidth * (settings.minBarWidth / 100);
    let maxWidth =
      funnelWidth -
      2 * offsetX -
      (stage.statusPoints.length - 1) * settings.barPadding;
    if (maxWidth < minBarWidth) {
      degree =
        (Math.atan(
          (funnelWidth - minBarWidth - 2 * settings.margin) / (2 * statusBarY)
        ) *
          180) /
        Math.PI;
      degree = Math.round(degree);
      console.log("New degree", degree);
    }

    data.forEach((stage, index) => {
      const statusBarY = this.stageScale(<string>stage.stageName);
      let offsetX =
        Math.tan((degree * Math.PI) / 180) * statusBarY + settings.margin;
      let maxWidth: number;
      if (settings.funnelType == "stage") {
        let width =
          funnelWidth - (stage.statusPoints.length - 1) * settings.barPadding;
        let statusScale = d3
          .scaleLinear()
          .domain([0, <number>this.model.maxStageValue])
          .range([0, funnelWidth]);
        maxWidth = statusScale(<number>stage.sumStatus) - 2 * settings.margin;
        // if (maxWidth < minBarWidth) maxWidth = minBarWidth;
        console.log(maxWidth);

        offsetX = width / 2 - maxWidth / 2;
      } else {
        maxWidth =
          funnelWidth -
          2 * offsetX -
          (stage.statusPoints.length - 1) * settings.barPadding;
      }

      let statusContainer = this.funnelContainer.select(
        `#status-container-${index}`
      );
      statusContainer.selectAll("text.status-label").remove();
      statusContainer.attr(
        "transform",
        `translate(${this.model.statusBarX1 + offsetX}, ${statusBarY})`
      );
      let statusScale = d3
        .scaleLinear()
        // .domain([0, (<number>stage.sumStatus * settings.scale) / 100])
        .domain([0, <number>stage.sumStatus])
        .range([0, maxWidth]);
      console.log(maxWidth);

      // change values to min, if value < min
      // let isChangeStatusValues = false;
      // for (let i = 0; i < stage.statusPoints.length; i++) {
      //   let width = statusScale(<number>stage.statusPoints[i].value);
      //   if (width < minBarWidth) {
      //     stage.statusPoints[i].value =
      //       (minBarWidth * <number>stage.statusPoints[i].value) / width;
      //     isChangeStatusValues = true;
      //   }
      // }
      let newSumStatusValues = 0;
      let newMaxStageWidth = 0;
      stage.statusPoints.forEach((v) => {
        let width = statusScale(<number>v.value);
        newMaxStageWidth += width < minBarWidth ? minBarWidth : width;
        newSumStatusValues +=
          width < minBarWidth
            ? (minBarWidth * <number>v.value) / width
            : <number>v.value;
      });

      // if (settings.funnelType == "stage") {
      //   console.log(this.model.statusBarX1, this.model.statusBarX2);

      //   statusScale = d3
      //     .scaleLinear()
      //     .domain([0, <number>this.model.sumAllStageValue])
      //     .range([0, funnelWidth]);
      //   statusContainer.attr(
      //     "transform",
      //     `translate(${
      //       this.model.statusBarX1 +
      //       offsetX -
      //       statusScale(<number>stage.sumStatus) / 2
      //     }, ${statusBarY})`
      //   );
      // }

      // add status bar
      let statusBar = statusContainer
        .selectAll("rect.status-bar")
        .data(stage.statusPoints);
      let mergeStatus = statusBar
        .enter()
        .append("rect")
        .classed("status-bar", true);
      statusBar
        .merge(mergeStatus)
        .attr("x", (d, i) => {
          let width = Math.round(statusScale(<number>d.value));
          if (i == 0) return 0;
          let newScale = d3.scaleLinear();
          if (width < minBarWidth)
            newScale
              .range([0, newMaxStageWidth])
              .domain([0, <number>stage.sumStatus]);
          else newScale.range([0, maxWidth]).domain([0, newSumStatusValues]);

          let sumStatus = 0;
          stage.statusPoints
            .map((v) => v.value)
            .filter((v, j) => j < i)
            .forEach((v) => (sumStatus += newScale(<number>v)));
          return Math.round(sumStatus) + i * settings.barPadding;
        })
        .attr("width", (d) => {
          let width = Math.round(statusScale(<number>d.value));
          let newScale = d3.scaleLinear();
          console.log(d.statusName, width, minBarWidth);
          
          if (width < minBarWidth)
            return newScale
              .range([0, newMaxStageWidth])
              .domain([0, <number>stage.sumStatus])(<number>d.value);
          else
            return newScale
              .range([0, maxWidth])
              .domain([0, newSumStatusValues])(<number>d.value);

          // if (width > maxWidth) return maxWidth;
          return width;
        })
        .attr("height", this.stageScale.bandwidth())
        .style("fill", (d) => d.color);

      // add status label
      if (this.model.settings.status.show) {
        let statusLabel = statusContainer
          .selectAll("text.status-label")
          .data(stage.statusPoints);
        let mergeStatusLabel = statusLabel
          .enter()
          .append("text")
          .classed("status-label", true);
        statusLabel
          .merge(mergeStatusLabel)
          .each((d) => {
            let textProperties: TextProperties = {
              fontFamily: statusSettings.fontFamily,
              fontSize: statusSettings.textSize + "pt",
              text: this.model.settings.status.statusValueOnFunnel
                ? <string>d.formattedValue
                : <string>d.statusName,
            };
            d.formattedStatusName =
              textMeasurementService.getTailoredTextOrDefault(
                textProperties,
                Math.ceil(statusScale(<number>d.value))
              );
          })
          .attr("dominant-baseline", "middle")
          .attr("text-anchor", "middle")
          .attr("x", (d, i) => {
            let baseOffset =
              Math.round(statusScale(<number>d.value)) / 2 +
              i * settings.barPadding;

            if (i == 0) return baseOffset;
            return (
              Math.round(
                statusScale(
                  <number>stage.statusPoints
                    .map((v) => v.value)
                    .filter((v, j) => j < i)
                    .reduce((acc, v) => Number(acc) + Number(v))
                )
              ) + baseOffset
            );
          })
          .attr("y", (d) => this.stageScale.bandwidth() / 2)
          .attr("heigh", this.stageScale.bandwidth())
          .style("font-size", statusSettings.textSize + "pt")
          .style("font-family", statusSettings.fontFamily)
          .style("font-weight", statusSettings.isBold ? "bold" : "")
          .style("font-style", statusSettings.isItalic ? "italic" : "")
          .style("fill", statusSettings.color)
          .text((d) => {
            let textProperties: TextProperties = {
              fontFamily: statusSettings.fontFamily,
              fontSize: statusSettings.textSize + "pt",
              text: this.model.settings.status.statusValueOnFunnel
                ? <string>d.formattedValue
                : <string>d.statusName,
            };
            if (
              textMeasurementService.measureSvgTextWidth(textProperties) >
              Math.ceil(statusScale(<number>d.value))
            )
              return null;
            return this.model.settings.status.statusValueOnFunnel
              ? <string>d.formattedValue
              : <string>d.statusName;
          });
        statusLabel.exit().remove();
      }
      if (stage.sumStatus == 0) {
        statusContainer.remove();
      }
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
            margin: this.model.settings.stageLabel.margin,
          },
          selector: null,
          validValues: {
            maxWidth: {
              numberRange: {
                min: 15,
                max: 100,
              },
            },
            margin: {
              numberRange: {
                min: 0,
                max: 25,
              },
            },
          },
        });
        break;

      case "status":
        this.addAnInstanceToEnumeration(instances, {
          objectName,
          properties: {
            decimalPlaces: this.model.settings.status.decimalPlaces,
          },
          selector: null,
          validValues: {
            decimalPlaces: {
              numberRange: {
                min: 0,
                max: 9,
              },
            },
          },
        });
        break;

      case "valueLabel":
        this.addAnInstanceToEnumeration(instances, {
          objectName,
          properties: {
            maxWidth: this.model.settings.valueLabel.maxWidth,
            decimalPlaces: this.model.settings.valueLabel.decimalPlaces,
            margin: this.model.settings.valueLabel.margin,
          },
          selector: null,
          validValues: {
            maxWidth: {
              numberRange: {
                min: 15,
                max: 30,
              },
            },
            decimalPlaces: {
              numberRange: {
                min: 0,
                max: 9,
              },
            },
            margin: {
              numberRange: {
                min: 0,
                max: 25,
              },
            },
          },
        });
        break;

      case "funnel":
        this.addAnInstanceToEnumeration(instances, {
          objectName,
          properties: {
            funnelType: this.model.settings.funnel.funnelType,
            barPadding: this.model.settings.funnel.barPadding,
            verticalBarPadding: this.model.settings.funnel.verticalBarPadding,
            degree: this.model.settings.funnel.degree,
            margin: this.model.settings.funnel.margin,
            minBarWidth: this.model.settings.funnel.minBarWidth,
            minBarHeight: this.model.settings.funnel.minBarHeight,
            scale: this.model.settings.funnel.scale,
          },
          selector: null,
          validValues: {
            barPadding: {
              numberRange: {
                min: 0,
                max: 30,
              },
            },
            verticalBarPadding: {
              numberRange: {
                min: 0,
                max: 50,
              },
            },
            degree: {
              numberRange: {
                min: 10,
                max: 45,
              },
            },
            margin: {
              numberRange: {
                min: 5,
                max: 30,
              },
            },
            minBarWidth: {
              numberRange: {
                min: 0,
                max: 50,
              },
            },
            minBarHeight: {
              numberRange: {
                min: 20,
                max: 100,
              },
            },
            scale: {
              numberRange: {
                min: 10,
                max: 100,
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

  public getTooltipData(value: IStatusPoint): VisualTooltipDataItem[] {
    let tooltip: VisualTooltipDataItem[] = [];
    value.tooltipValues.forEach((tooltipValue) => {
      tooltip.push({
        displayName: tooltipValue.displayName,
        value: tooltipValue.dataLabel,
      });
    });

    return tooltip;
  }

  public synSelections() {
    let area = select("rect.rect-container");
    let bars = this.funnelContainer.selectAll("rect.status-bar");
    let statuses = this.funnelContainer.selectAll("text.status-label");
    let stages = this.funnelContainer.selectAll("text.stage-label");

    area.on("click", () => {
      if (this.selectionManager.hasSelection()) {
        this.selectionManager.clear().then(() => {
          this.syncSelectionState(bars, []);
          this.syncSelectionState(stages, []);
        });
      }

      bars.attr("fill-opacity", 1);
      stages.attr("fill-opacity", 1);
    });

    bars.on("click", (d: IStatusPoint) => {
      const mouseEvent: MouseEvent = getEvent();
      const isCtrlPressed: boolean = mouseEvent.ctrlKey;

      this.selectionManager
        .select(d.selectionId, isCtrlPressed)
        .then((ids: ISelectionId[]) => {
          this.syncSelectionState(bars, ids, 1);
          if (!isCtrlPressed) this.syncSelectionState(stages, []);
        });
    });

    statuses.on("click", (d: IStatusPoint) => {
      const mouseEvent: MouseEvent = getEvent();
      const isCtrlPressed: boolean = mouseEvent.ctrlKey;

      this.selectionManager
        .select(d.selectionId, isCtrlPressed)
        .then((ids: ISelectionId[]) => {
          this.syncSelectionState(bars, ids, 1);
          if (!isCtrlPressed) this.syncSelectionState(stages, []);
        });
    });

    stages.on("click", (d: IDataPoint) => {
      const mouseEvent: MouseEvent = getEvent();
      const isCtrlPressed: boolean = mouseEvent.ctrlKey;
      this.selectionManager
        .select(d.selectionId, isCtrlPressed)
        .then((ids: ISelectionId[]) => {
          this.syncSelectionState(stages, ids, 1);
          if (!isCtrlPressed) this.syncSelectionState(bars, []);
        });
    });
  }

  private syncSelectionState(
    selection: Selection<BaseType, any, BaseType, any>,
    selectionIds: ISelectionId[],
    opacity: number = null
  ): void {
    if (!selection || !selectionIds) {
      return;
    }

    if (!selectionIds.length) {
      selection.style("fill-opacity", null);
      return;
    }

    selection.each((dataPoint, i, nodes) => {
      const isSelected: boolean = this.isSelectionIdInArray(
        selectionIds,
        dataPoint.selectionId
      );
      select(nodes[i]).style(
        "fill-opacity",
        isSelected ? opacity : opacity / 2
      );
    });
  }

  private isSelectionIdInArray(
    selectionIds: ISelectionId[],
    selectionId: ISelectionId
  ): boolean {
    if (!selectionIds || !selectionId) {
      return false;
    }

    return selectionIds.some((currentSelectionId: ISelectionId) => {
      return currentSelectionId.includes(selectionId);
    });
  }

  private addContextMenu() {
    let area = select("rect.rect-container");
    let bars = this.funnelContainer.selectAll("rect.status-bar");
    let statuses = this.funnelContainer.selectAll("text.status-label");
    let stages = this.funnelContainer.selectAll("text.stage-label");

    bars.on("contextmenu", (d: IStatusPoint) => {
      const mouseEvent: MouseEvent = getEvent();

      this.selectionManager.showContextMenu(d.selectionId, {
        x: mouseEvent.x,
        y: mouseEvent.y,
      });
      mouseEvent.preventDefault();
    });

    statuses.on("contextmenu", (d: IStatusPoint) => {
      const mouseEvent: MouseEvent = getEvent();

      this.selectionManager.showContextMenu(d.selectionId, {
        x: mouseEvent.x,
        y: mouseEvent.y,
      });
      mouseEvent.preventDefault();
    });

    stages.on("contextmenu", (d: IDataPoint) => {
      const mouseEvent: MouseEvent = getEvent();

      this.selectionManager.showContextMenu(d.selectionId, {
        x: mouseEvent.x,
        y: mouseEvent.y,
      });
      mouseEvent.preventDefault();
    });

    // area.on("contextmenu", () => {
    //   const mouseEvent: MouseEvent = getEvent();
    //   this.selectionManager.showContextMenu(
    //     {},
    //     { x: mouseEvent.x, y: mouseEvent.y }
    //   );
    // });
  }
}
