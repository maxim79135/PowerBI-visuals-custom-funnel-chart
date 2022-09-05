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
import { ColorHelper } from "powerbi-visuals-utils-colorutils";

import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import ValueTypeDescriptor = powerbi.ValueTypeDescriptor;
import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
import DataViewObjects = powerbi.DataViewObjects;
import IColorPalette = powerbi.extensibility.IColorPalette;
import PrimitiveValue = powerbi.PrimitiveValue;

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
      statusBarX1: undefined,
      statusBarX2: undefined,
    };

  let dataCategorical = dataViews[0].categorical;
  let stageCategory = dataCategorical.categories.find(
    (v) => v.source.roles["stage"]
  );
  let stageCategoryValues = stageCategory.values;
  let statusCategory = dataCategorical.categories.find(
    (v) => v.source.roles["status"]
  );
  let statusCategoryValues = statusCategory.values;
  let valuesColumn = dataCategorical.values.find(
    (v) => v.source.roles["values"]
  );
  let values = valuesColumn.values;

  // push values in dataPoints
  let id = 0;
  stageCategoryValues.forEach((stage, index) => {
    const statusSelectionId = host
      .createSelectionIdBuilder()
      .withCategory(statusCategory, index)
      .createSelectionId();
    let color: string;

    if (
      statusCategory &&
      statusCategory.objects &&
      statusCategory.objects[index]
    ) {
      color = getValue(statusCategory.objects[index], "dataColors", "color", {
        solid: { color: "#333333" },
      }).solid.color;
    } else {
      color = settings.dataColors.color;
    }
    let tooltipValues_ = [
      {
        displayName: stageCategory.source.displayName,
        dataLabel: <string>stage,
      },
      {
        displayName: statusCategory.source.displayName,
        dataLabel: <string>statusCategoryValues[index],
      },
      {
        displayName: valuesColumn.source.displayName,
        dataLabel: prepareMeasureText(
          values[index],
          valuesColumn.source.type,
          valuesColumn.objects
            ? <string>valuesColumn.objects[0]["general"]["formatString"]
            : valueFormatter.getFormatStringByColumn(valuesColumn.source),
          1,
          0,
          false,
          false,
          "",
          host.locale
        ),
      },
      ...dataCategorical.values
        .filter((v) => v.source.roles["tooltip"])
        .map((tooltip) => {
          return {
            displayName: tooltip.source.displayName,
            dataLabel: prepareMeasureText(
              tooltip.values[index],
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

    if (!dataPoints.find((v) => v.stageName == stage)) {
      dataPoints.push({
        id: id,
        stageName: stage,
        formattedStageName: stage,
        statusPoints: [
          {
            statusName: statusCategoryValues[index],
            formattedStatusName: statusCategoryValues[index],
            value: values[index],
            selectionId: statusSelectionId,
            color: color,
            tooltipValues: tooltipValues_,
          },
        ],
        sumStatus: 0,
        formattedSumStatus: undefined,
        selectionId: host
          .createSelectionIdBuilder()
          .withCategory(stageCategory, index)
          .createSelectionId(),
      });
      id++;
    } else {
      dataPoints
        .find((v) => v.stageName == stage)
        .statusPoints.push({
          statusName: statusCategoryValues[index],
          formattedStatusName: statusCategoryValues[index],
          value: values[index],
          selectionId: statusSelectionId,
          color: color,
          tooltipValues: tooltipValues_,
        });
    }
  });

  // calc sumStatus for each stage
  dataPoints.forEach((v) => {
    v.sumStatus = v.statusPoints
      .map((status) => status.value)
      .reduce((acc, v) => Number(acc) + Number(v));
    v.formattedSumStatus = prepareMeasureText(
      v.sumStatus,
      valuesColumn.source.type,
      valuesColumn.objects
        ? <string>valuesColumn.objects[0]["general"]["formatString"]
        : valueFormatter.getFormatStringByColumn(valuesColumn.source),
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
    statusBarX1: undefined,
    statusBarX2: undefined,
  };

  return viewModel;
}
