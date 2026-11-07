using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

// A bounded child process owns this reader. It never changes registry settings,
// resets a connector, changes a role or sends a power request.
// Interface/IOCTL interoperability was checked against Microsoft's MUTT 3.0.1
// UcsiControl.exe; UCSI data-block offsets follow ucmucsispec.h.
public static class CablewiseUcsi {
  [StructLayout(LayoutKind.Sequential)] struct InterfaceData {
    public int Size; public Guid Class; public int Flags; public IntPtr Reserved;
  }
  public class Response {
    public string Name; public string Control; public bool IoctlSuccess;
    public int Win32Error; public int Returned; public int Version;
    public uint Cci; public byte[] Data;
  }
  public class Controller {
    public string Path; public bool Accessible; public int OpenError;
    public List<Response> Responses = new List<Response>();
  }
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern IntPtr SetupDiGetClassDevs(ref Guid guid, string enumerator, IntPtr hwnd, uint flags);
  [DllImport("setupapi.dll", SetLastError=true)]
  static extern bool SetupDiEnumDeviceInterfaces(IntPtr set, IntPtr data, ref Guid guid, uint index, ref InterfaceData iface);
  [DllImport("setupapi.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr set, ref InterfaceData iface, IntPtr detail, uint size, out uint required, IntPtr data);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFile(string file, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool DeviceIoControl(SafeFileHandle h, uint code, byte[] input, int inputSize, byte[] output, int outputSize, out int returned, IntPtr overlapped);
  static Response Query(SafeFileHandle handle, string name, ulong control) {
    // Defense in depth: this public reader cannot issue mutating UCSI commands.
    byte command=(byte)(control & 255);
    if(command!=6 && command!=7 && command!=0x11 && command!=0x12 && command!=0x15) throw new ArgumentException("Only read-only UCSI queries are allowed");
    byte[] input=new byte[48], output=new byte[48];
    Array.Copy(BitConverter.GetBytes(control),0,input,8,8);
    int returned;
    bool ok=DeviceIoControl(handle,0x12131018,input,input.Length,output,output.Length,out returned,IntPtr.Zero);
    int error=ok?0:Marshal.GetLastWin32Error();
    uint cci=ok && returned>=8?BitConverter.ToUInt32(output,4):0;
    int length=(int)((cci>>8)&255);
    byte[] data=new byte[0];
    if(ok && length<=16 && returned>=16+length) {
      data=new byte[length];Array.Copy(output,16,data,0,length);
    }
    return new Response {Name=name,Control=control.ToString("X"),IoctlSuccess=ok,Win32Error=error,Returned=returned,
      Version=ok && returned>=2?BitConverter.ToUInt16(output,0):0,Cci=cci,Data=data};
  }
  static bool HasData(Response r,int length) {
    return r.IoctlSuccess && (r.Cci&0x80000000)!=0 && (r.Cci&0x52000000)==0 && r.Data.Length>=length;
  }
  public static Controller[] Read() {
    var results=new List<Controller>();
    Guid guid=new Guid("0d3bc324-0125-4e95-b25a-7b393333ea9a");
    IntPtr set=SetupDiGetClassDevs(ref guid,null,IntPtr.Zero,18);
    if(set==new IntPtr(-1)) return results.ToArray();
    try {
      for(uint index=0;index<8;index++) {
        var iface=new InterfaceData {Size=Marshal.SizeOf(typeof(InterfaceData))};
        if(!SetupDiEnumDeviceInterfaces(set,IntPtr.Zero,ref guid,index,ref iface)) break;
        uint required;SetupDiGetDeviceInterfaceDetail(set,ref iface,IntPtr.Zero,0,out required,IntPtr.Zero);
        if(required<8 || required>65536) continue;
        IntPtr detail=Marshal.AllocHGlobal((int)required);
        try {
          Marshal.WriteInt32(detail,IntPtr.Size==8?8:6);
          if(!SetupDiGetDeviceInterfaceDetail(set,ref iface,detail,required,out required,IntPtr.Zero)) continue;
          string devicePath=Marshal.PtrToStringUni(IntPtr.Add(detail,4));
          var controller=new Controller {Path=devicePath};results.Add(controller);
          using(var handle=CreateFile(devicePath,0,3,IntPtr.Zero,3,0,IntPtr.Zero)) {
            if(handle.IsInvalid) {controller.OpenError=Marshal.GetLastWin32Error();continue;}
            controller.Accessible=true;
            var capability=Query(handle,"GET_CAPABILITY",6);controller.Responses.Add(capability);
            if(!HasData(capability,16)) continue;
            int ports=Math.Min(capability.Data[4]&127,8);
            int features=capability.Data[5]|(capability.Data[6]<<8)|(capability.Data[7]<<16);
            for(int port=1;port<=ports;port++) {
              ulong prefix=(ulong)port<<16;
              var status=Query(handle,"CONNECTOR_"+port+" GET_CONNECTOR_STATUS",prefix|0x12);controller.Responses.Add(status);
              // Cable details are optional. An empty reply is never a detected cable.
              if((features&32)!=0) controller.Responses.Add(Query(handle,"CONNECTOR_"+port+" GET_CABLE_PROPERTY",prefix|0x11));
              if((features&256)!=0) {
                ulong identity=prefix|0x15|((ulong)2<<23)|((ulong)4<<42);
                controller.Responses.Add(Query(handle,"CONNECTOR_"+port+" GET_CABLE_IDENTITY_0",identity|((ulong)16<<34)));
                controller.Responses.Add(Query(handle,"CONNECTOR_"+port+" GET_CABLE_IDENTITY_16",identity|((ulong)16<<26)|((ulong)12<<34)));
              }
            }
          }
        } finally {Marshal.FreeHGlobal(detail);}
      }
    } finally {SetupDiDestroyDeviceInfoList(set);}
    return results.ToArray();
  }
}
