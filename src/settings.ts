/*
 *  Power BI Visualizations
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

import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class StageLabel {
  public textSize: number = 10;
  public fontFamily: string =
    "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public color: string = "#333333";
  public isItalic: boolean = false;
  public isBold: boolean = false;
  public maxWidth: number = 30;
  public margin: number = 0;
}

export class ValueLabel {
  public textSize: number = 10;
  public fontFamily: string =
    "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public color: string = "#333333";
  public isItalic: boolean = false;
  public isBold: boolean = false;
  public maxWidth: number = 30;
  public displayUnit: number = 0;
  public decimalPlaces: number = 0;
  public margin: number = 0;
  public show: boolean = true;
}

export class Status {
  public textSize: number = 10;
  public fontFamily: string =
    "'Segoe UI', wf_segoe-ui_normal, helvetica, arial, sans-serif";
  public color: string = "#333333";
  public isItalic: boolean = false;
  public isBold: boolean = false;
  public show: boolean = true;
  public statusValueOnFunnel: boolean = false;
  public displayUnit: number = 0;
  public decimalPlaces: number = 0;
}

export class Funnel {
  public funnelType: string = "angle";
  public barPadding: number = 5;
  public verticalBarPadding: number = 25;
  public degree: number = 30;
  public margin: number = 30;
  public minBarWidth: number = 15;
  public minBarHeight: number = 30;
  public invertStagePosition: boolean = false;
  public scale: number = 100;
}

export class DataColors {
  public color: string = "#01b8aa";
  public showAll: boolean = false;
}

export class FunnelChartSettings extends DataViewObjectsParser {
  public stageLabel: StageLabel = new StageLabel();
  public valueLabel: ValueLabel = new ValueLabel();
  public status: Status = new Status();
  public dataColors: DataColors = new DataColors();
  public funnel: Funnel = new Funnel();
}
