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

import powerbi from "powerbi-visuals-api";
import { FunnelChartSettings } from "../settings";
import {
  IDataPoint,
  ITooltipValue,
  IFunnelChartViewModel,
  IStatusPoint,
} from "./ViewModel";
import { getValue } from "../utils/objectEnumerationUtility";
import { prepareMeasureText } from "../utils/dataLabelUtility";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";

import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;

function parseSettings(dataView: DataView): FunnelChartSettings {
  return <FunnelChartSettings>FunnelChartSettings.parse(dataView);
}

// tslint:disable-next-line: max-func-body-length disable-next-line: export-name
export function visualTransform(
  options: VisualUpdateOptions,
  host: IVisualHost
): IFunnelChartViewModel {
  let viewModel: IFunnelChartViewModel;
  let dataViews: DataView[] = options.dataViews;
  let dataPoints: IDataPoint[] = [];
  let settings: FunnelChartSettings = parseSettings(dataViews[0]);

  if (!dataViews || !dataViews[0] || !dataViews[0].categorical)
    return {
      settings: settings,
      dataPoints: dataPoints,
      maxStageName: undefined,
      maxValueLabel: undefined,
      maxStageValue: undefined,
      statusBarX1: undefined,
      statusBarX2: undefined,
    };

  let metadata = dataViews[0].metadata;
  let dataCategorical = dataViews[0].categorical;
  let stageCategory = dataCategorical.categories.find(
    (v) => v.source.roles["stage"]
  );
  let stageCategoryValues = stageCategory.values;
  let valuesColumn = dataCategorical.values;
  let valuesColumnGrouped = valuesColumn.grouped();
  let firstValue = valuesColumn.find((v) => v.source.roles["values"]);

  // add stages
  stageCategoryValues.forEach((stage, index) => {
    dataPoints.push({
      id: index,
      stageName: stage,
      formattedStageName: undefined,
      statusPoints: [],
      sumStatus: undefined,
      formattedSumStatus: undefined,
      selectionId: host
        .createSelectionIdBuilder()
        .withCategory(stageCategory, index)
        .createSelectionId(),
    });
  });

  // add statuses and values
  let statusMetadata = metadata.columns.find((v) => v.roles["status"]) ?? {
    displayName: "",
  };
  valuesColumnGrouped.forEach((status, index) => {
    let tooltips = status.values.filter((v) => v.source.roles["tooltip"]);
    let values = status.values.filter((v) => v.source.roles["values"])[0];
    values.values.forEach((value, stageIndex) => {
      if (value == null) return;

      let statusPointValue = values.values[stageIndex];
      let stageName = dataPoints[stageIndex].stageName;
      let color: string;

      let tooltipsValues_: ITooltipValue[] = [
        {
          displayName: stageCategory.source.displayName,
          dataLabel: <string>stageName,
        },
        {
          displayName: statusMetadata.displayName,
          dataLabel: <string>status.name,
        },
        {
          displayName: values.source.displayName,
          dataLabel: prepareMeasureText(
            statusPointValue,
            values.source.type,
            values.objects
              ? <string>values.objects[0]["general"]["formatString"]
              : valueFormatter.getFormatStringByColumn(values.source),
            1,
            0,
            false,
            false,
            "",
            host.locale
          ),
        },
        ...tooltips.map((tooltip): ITooltipValue => {
          return {
            displayName: tooltip.source.displayName,
            dataLabel: prepareMeasureText(
              tooltip.values[stageIndex],
              tooltip.source.type,
              tooltip.objects
                ? <string>tooltip.objects[0]["general"]["formatString"]
                : valueFormatter.getFormatStringByColumn(tooltip.source),
              1,
              0,
              false,
              false,
              "",
              host.locale
            ),
          };
        }),
      ];

      if (status && status.objects) {
        color = getValue(status.objects, "dataColors", "color", {
          solid: { color: "#333333" },
        }).solid.color;
      } else {
        color = settings.dataColors.color;
      }

      let formattedValue = prepareMeasureText(
        statusPointValue,
        firstValue.source.type,
        firstValue.objects
          ? <string>firstValue.objects[0]["general"]["formatString"]
          : valueFormatter.getFormatStringByColumn(firstValue.source),
        settings.status.displayUnit,
        settings.status.decimalPlaces,
        false,
        false,
        "",
        host.locale
      );
      // if (statusPointValue) {
      dataPoints[stageIndex].statusPoints.push({
        statusName: status.name,
        formattedStatusName: status.name,
        value: statusPointValue,
        formattedValue: formattedValue,
        tooltipValues: tooltipsValues_,
        color: color,
        selectionId: host
          .createSelectionIdBuilder()
          .withSeries(valuesColumn, status)
          .createSelectionId(),
      });
    });
    // let stageIndex = values.values.findIndex((v) => v != null);
    // if (stageIndex == -1) {
    //   tooltips.forEach((tooltip) => {
    //     let i = tooltip.values.findIndex((v) => v != null);
    //     if (i != -1) {
    //       stageIndex = i;
    //       return;
    //     }
    //   });
    // }
    // console.log(status);
    // }
  });

  // calc sumStatus for each stage
  dataPoints.forEach((v) => {
    v.sumStatus = v.statusPoints
      .map((status) => status.value)
      .reduce((acc, v) => Number(acc) + Number(v));
    v.formattedSumStatus = prepareMeasureText(
      v.sumStatus,
      firstValue.source.type,
      firstValue.objects
        ? <string>firstValue.objects[0]["general"]["formatString"]
        : valueFormatter.getFormatStringByColumn(firstValue.source),
      settings.valueLabel.displayUnit,
      settings.valueLabel.decimalPlaces,
      false,
      false,
      "",
      host.locale
    );
  });

  // calc longest stage name
  let maxStageName = dataPoints
    .map((d) => d.stageName)
    .reduce((a, b) => (String(a).length > String(b).length ? a : b));

  // calc longest value label
  let maxValueLabel = dataPoints
    .map((d) => d.formattedSumStatus)
    .reduce((a, b) => (String(a).length > String(b).length ? a : b));

  viewModel = {
    dataPoints: dataPoints,
    settings: settings,
    maxStageName: maxStageName,
    maxValueLabel: maxValueLabel,
    maxStageValue: dataPoints
      .map((stage) => stage.sumStatus)
      .reduce((acc, stage) => (Number(acc) > Number(stage) ? acc : stage)),
    statusBarX1: undefined,
    statusBarX2: undefined,
  };

  return viewModel;
}
