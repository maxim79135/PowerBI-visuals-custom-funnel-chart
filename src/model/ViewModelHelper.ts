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
    };

  let dataCategorical = dataViews[0].categorical;
  let stageCategory = dataCategorical.categories.find(
    (v) => v.source.roles["stage"]
  ).values;
  let statusCategory = dataCategorical.categories.find(
    (v) => v.source.roles["status"]
  ).values;
  let values = dataCategorical.values.find(
    (v) => v.source.roles["values"]
  ).values;

  let id = 0;
  stageCategory.forEach((stage, index) => {
    if (!dataPoints.find((v) => v.stageName == stage)) {
      dataPoints.push({
        id: id,
        stageName: stage,
        statusPoints: [
          {
            statusName: statusCategory[index],
            value: values[index],
          },
        ],
        sumStatus: values[index],
        selectionId: null,
        tooltipValues: null,
      });
      id++;
    } else {
      dataPoints
        .find((v) => v.stageName == stage)
        .statusPoints.push({
          statusName: statusCategory[index],
          value: values[index],
        });
    }
  });

  viewModel = {
    dataPoints: dataPoints,
    settings: settings,
  };

  return viewModel;
}
