The macOS IORegistry property handling and USB PD cable-field decoding were
informed by and adapted from MIT-licensed portions of WhatCable:
https://github.com/darrylmorley/whatcable
Sources/WhatCableCore/PD/USBPDVDO.swift and
Sources/WhatCableDarwinBackend/Watchers/USBPDSOPWatcher.swift.
No proprietary WhatCablePlugins code is included.

MIT License

Copyright (c) 2026 Darryl Morley

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

Electron/Chromium runtime notices are distributed with the packaged application.
Other npm dependency licenses remain in their installed packages. The application
itself is private project code and is not published under the licenses above.
