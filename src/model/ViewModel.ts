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

import { FunnelChartSettings } from "../settings";
import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import PrimitiveValue = powerbi.PrimitiveValue;

export interface IDataPoint {
  id: number;
  stageName: PrimitiveValue;
  formattedStageName: PrimitiveValue;
  statusPoints: IStatusPoint[];
  sumStatus: PrimitiveValue;
  selectionId: ISelectionId;
  tooltipValues: ITooltipValue[];
  x2: number;
}

export interface IStatusPoint {
  statusName: PrimitiveValue;
  value: PrimitiveValue;
  color: string;
  selectionId: ISelectionId;
}

export interface ITooltipValue {
  displayName: string;
  dataLabel: string;
}

export interface IFunnelChartViewModel {
  settings: FunnelChartSettings;
  dataPoints: IDataPoint[];
  maxStageName: PrimitiveValue;
}
