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
    this.synSelections();
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
          Math.ceil(width)
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
    if (inverted) {
      [this.model.statusBarX1, this.model.statusBarX2] = [
        width + settings.margin,
        this.width - this.model.statusBarX1,
      ];
    }

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

        d.formattedSumStatus = textMeasurementService.getTailoredTextOrDefault(
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
          this.stageScale(<string>d.stageName) + this.stageScale.bandwidth() / 2
      )
      .attr("heigh", this.stageScale.bandwidth())
      .style("font-size", settings.textSize + "pt")
      .style("font-family", settings.fontFamily)
      .style("font-weight", settings.isBold ? "bold" : "")
      .style("font-style", settings.isItalic ? "italic" : "")
      .style("fill", settings.color)
      .text((d) => <string>d.formattedSumStatus);
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
    let maxWidth =
      (this.model.statusBarX2 ?? this.width) -
      this.model.statusBarX1 -
      2 * offsetX -
      (stage.statusPoints.length - 1) * settings.barPadding;
    if (maxWidth < 0) {
      degree =
        (Math.atan(
          ((this.model.statusBarX2 ?? this.width) -
            this.model.statusBarX1 -
            this.width * (settings.minBarWidth / 100) -
            2 * settings.margin) /
            2 /
            statusBarY
        ) *
          180) /
        Math.PI;
      degree = Math.round(degree);
    }

    data.forEach((stage, index) => {
      const statusBarY = this.stageScale(<string>stage.stageName);
      const offsetX =
        Math.tan((degree * Math.PI) / 180) * statusBarY + settings.margin;
      let maxWidth =
        this.width -
        this.model.statusBarX1 -
        2 * offsetX -
        (stage.statusPoints.length - 1) * settings.barPadding -
        (this.width - (this.model.statusBarX2 ?? this.width));

      let statusContainer = this.funnelContainer.select(
        `#status-container-${index}`
      );
      statusContainer.attr(
        "transform",
        `translate(${this.model.statusBarX1 + offsetX}, ${statusBarY})`
      );
      let statusScale = d3
        .scaleLinear()
        .domain([0, <number>stage.sumStatus])
        .range([0, maxWidth]);

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
          if (i == 0) return 0;

          return (
            Math.round(
              statusScale(
                <number>stage.statusPoints
                  .map((v) => v.value)
                  .filter((v, j) => j < i)
                  .reduce((acc, v) => Number(acc) + Number(v))
              )
            ) +
            i * settings.barPadding
          );
        })
        .attr("width", (d) => Math.round(statusScale(<number>d.value)))
        .attr("height", this.stageScale.bandwidth())
        .style("fill", (d) => d.color);

      // add status label
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
            text: <string>d.statusName,
          };
          d.formattedStatusName =
            textMeasurementService.getTailoredTextOrDefault(
              textProperties,
              Math.ceil(Math.round(statusScale(<number>d.value)))
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
        .text((d) => <string>d.formattedStatusName);

      statusBar.exit().remove();
      statusLabel.exit().remove();
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
                max: 30,
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
            barPadding: this.model.settings.funnel.barPadding,
            degree: this.model.settings.funnel.degree,
            margin: this.model.settings.funnel.margin,
            minBarWidth: this.model.settings.funnel.minBarWidth,
          },
          selector: null,
          validValues: {
            barPadding: {
              numberRange: {
                min: 5,
                max: 30,
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

    stages.on("click", (d: IDataPoint) => {
      const mouseEvent: MouseEvent = getEvent();
      const isCtrlPressed: boolean = mouseEvent.ctrlKey;
      this.selectionManager
        .select(
          d.statusPoints.map((v) => v.selectionId),
          isCtrlPressed
        )
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
}
