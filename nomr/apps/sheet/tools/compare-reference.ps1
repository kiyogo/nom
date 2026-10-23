param(
    [Parameter(Mandatory=$true)][string]$Capture,
    [Parameter(Mandatory=$true)][string]$HeaderReference,
    [Parameter(Mandatory=$true)][string]$GridReference,
    [Parameter(Mandatory=$true)][string]$Report,
    [switch]$RequireMatchingGeometry
)
$ErrorActionPreference='Stop'

# Compare the app's GPU screenshot with the supplied reference crops at 100% DPI.
# Header content (document name and Sheet command labels) intentionally differs.
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies @([System.Drawing.Bitmap].Assembly.Location,[System.Drawing.Color].Assembly.Location,'System.Runtime','System.Collections') -TypeDefinition @'
using System;
using System.Drawing;
using System.Collections.Generic;
public static class SheetReferenceComparison {
    public static object Compare(Bitmap actual, Bitmap reference, int offsetY, int height) {
        long exact=0, close=0, error=0;
        int width=Math.Min(reference.Width,actual.Width);
        height=Math.Min(height,Math.Min(reference.Height,actual.Height-offsetY));
        for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
            Color a=actual.GetPixel(x,y+offsetY), b=reference.GetPixel(x,y);
            int r=Math.Abs(a.R-b.R), g=Math.Abs(a.G-b.G), blue=Math.Abs(a.B-b.B);
            if(r+g+blue==0) exact++;
            if(Math.Max(r,Math.Max(g,blue))<=8) close++;
            error+=r+g+blue;
        }
        double total=(double)width*height;
        return new { Width=width,Height=height,ExactlyMatchingPixels=exact,
            ExactPercent=Math.Round(100*exact/total,3),Within8LevelsPercent=Math.Round(100*close/total,3),
            MeanChannelDifference=Math.Round(error/(total*3),4) };
    }
    public static int[] GridLines(Bitmap image,int offsetY,bool horizontal) {
        var positions=new List<int>();
        int max=horizontal?797:Math.Min(1084,image.Width);
        for(int i=horizontal?70:100;i<max;i++) {
            Color c=horizontal?image.GetPixel(200,i+offsetY):image.GetPixel(i,100+offsetY);
            if(Math.Abs(c.R-225)<=1 && c.R==c.G && c.G==c.B) positions.Add(i);
        }
        return positions.ToArray();
    }
    public static int[] SelectionEdges(Bitmap image,int offsetY,bool horizontal) {
        var positions=new List<int>();
        for(int i=0;i<(horizontal?120:170);i++) {
            Color c=horizontal?image.GetPixel(60,i+offsetY):image.GetPixel(i,76+offsetY);
            if(Math.Abs(c.R-50)<=1 && Math.Abs(c.G-113)<=1 && Math.Abs(c.B-234)<=1) positions.Add(i);
        }
        return positions.ToArray();
    }
}
'@
$actual=[System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Capture))
$header=[System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $HeaderReference))
$grid=[System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $GridReference))
try {
    $result=[ordered]@{
        CaptureSize=@($actual.Width,$actual.Height)
        LineColorTolerance=1
        LinePositionTolerance=0
        Header=[SheetReferenceComparison]::Compare($actual,$header,0,163)
        Grid=[SheetReferenceComparison]::Compare($actual,$grid,163,848)
        HorizontalLinesReference=[SheetReferenceComparison]::GridLines($grid,0,$true)
        HorizontalLinesActual=[SheetReferenceComparison]::GridLines($actual,163,$true)
        VerticalLinesReference=[SheetReferenceComparison]::GridLines($grid,0,$false)
        VerticalLinesActual=[SheetReferenceComparison]::GridLines($actual,163,$false)
        SelectionHorizontalReference=[SheetReferenceComparison]::SelectionEdges($grid,0,$true)
        SelectionHorizontalActual=[SheetReferenceComparison]::SelectionEdges($actual,163,$true)
        SelectionVerticalReference=[SheetReferenceComparison]::SelectionEdges($grid,0,$false)
        SelectionVerticalActual=[SheetReferenceComparison]::SelectionEdges($actual,163,$false)
        Note='Raw raster comparison includes blank cells. A high percentage does not certify zero-pixel error; inspect line coordinates and glyph differences.'
    }
    $result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Report -Encoding utf8
    if($RequireMatchingGeometry) {
        foreach($pair in @(@('HorizontalLinesReference','HorizontalLinesActual'),@('VerticalLinesReference','VerticalLinesActual'),@('SelectionHorizontalReference','SelectionHorizontalActual'),@('SelectionVerticalReference','SelectionVerticalActual'))) {
            if(($result[$pair[0]] -join ',') -ne ($result[$pair[1]] -join ',')) { throw "Geometry mismatch: $($pair[0]) / $($pair[1])" }
        }
    }
    $result | ConvertTo-Json -Depth 6
} finally {
    $actual.Dispose();$header.Dispose();$grid.Dispose()
}
