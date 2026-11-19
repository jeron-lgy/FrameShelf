$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationCore,WindowsBase
$references = @([Windows.Media.Imaging.BitmapSource].Assembly.Location, [Windows.Int32Rect].Assembly.Location, 'System.dll', 'System.Xaml.dll')
Add-Type -ReferencedAssemblies $references -TypeDefinition @"
using System;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

public static class FrameShelfPng {
    public static void Convert(string input, string output) {
        using (var stream = File.OpenRead(input)) {
            var source = new PngBitmapDecoder(stream, BitmapCreateOptions.PreservePixelFormat | BitmapCreateOptions.IgnoreColorProfile, BitmapCacheOption.Default).Frames[0];
            bool wide = source.Format == PixelFormats.Rgba64;
            if (!wide && source.Format != PixelFormats.Bgra32)
                throw new InvalidDataException("Expected an 8-bit or 16-bit RGBA PNG, received " + source.Format);
            int width = source.PixelWidth, height = source.PixelHeight;
            int stride = checked(width * (wide ? 8 : 4));
            int rows = Math.Min(height, 64);
            var bytes = new byte[checked(stride * rows)];
            var bitmap = new WriteableBitmap(width, height, source.DpiX, source.DpiY, source.Format, null);
            for (int y = 0; y < height; y += rows) {
                var rect = new Int32Rect(0, y, width, Math.Min(rows, height-y));
                source.CopyPixels(rect, bytes, stride, 0);
                int end = rect.Height * stride;
                if (wide) {
                    for (int p = 0; p < end; p += 8) {
                        uint alpha = (uint)(bytes[p+6] | bytes[p+7] << 8);
                        if (alpha == 0 || alpha == 65535) continue;
                        for (int c = p; c < p+6; c += 2) {
                            uint sample = (uint)(bytes[c] | bytes[c+1] << 8);
                            uint value = Math.Min(65535u, (sample * 65535u + alpha/2) / alpha);
                            bytes[c] = (byte)value;
                            bytes[c+1] = (byte)(value >> 8);
                        }
                    }
                } else {
                    for (int p = 0; p < end; p += 4) {
                        int alpha = bytes[p+3];
                        if (alpha == 0 || alpha == 255) continue;
                        for (int c = p; c < p+3; c++)
                            bytes[c] = (byte)Math.Min(255, (bytes[c]*255 + alpha/2)/alpha);
                    }
                }
                bitmap.WritePixels(rect, bytes, stride, 0);
            }
            var encoder = new PngBitmapEncoder();
            encoder.Frames.Add(BitmapFrame.Create(bitmap, null, null, source.ColorContexts));
            using (var dest = new FileStream(output, FileMode.CreateNew)) encoder.Save(dest);
        }
    }
}
"@
[FrameShelfPng]::Convert($env:FRAMESHELF_INPUT, $env:FRAMESHELF_OUTPUT)
