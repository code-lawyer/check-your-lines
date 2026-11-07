using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

// Read-only Windows USB hub enumeration. Layouts follow usbioctl.h (pack 1).
// Does not open device data endpoints, reset ports, or negotiate power.
public static class CablewiseUsb {
  [StructLayout(LayoutKind.Sequential)] struct InterfaceData {
    public int Size; public Guid Class; public int Flags; public IntPtr Reserved;
  }
  public class Connection {
    public string DriverKey; public string Speed; public string Location;
    public string HubPath; public uint PortNumber; public bool? UserConnectable;
    public bool? HostConnectorTypeC; public uint? PortProperties; public bool IsHub;
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
  static bool Query(SafeFileHandle h, uint code, byte[] b) { int read; return DeviceIoControl(h,code,b,b.Length,b,b.Length,out read,IntPtr.Zero); }
  static void Put(byte[] b,int offset,uint n) { Array.Copy(BitConverter.GetBytes(n),0,b,offset,4); }
  public static Connection[] Read() {
    var result = new List<Connection>();
    Guid guid = new Guid("f18a0e88-c30c-11d0-8815-00a0c906bed8");
    IntPtr set = SetupDiGetClassDevs(ref guid,null,IntPtr.Zero,18);
    if(set == new IntPtr(-1)) return result.ToArray();
    try {
      for(uint index=0; index<256; index++) {
        var iface=new InterfaceData { Size=Marshal.SizeOf(typeof(InterfaceData)) };
        if(!SetupDiEnumDeviceInterfaces(set,IntPtr.Zero,ref guid,index,ref iface)) break;
        uint required;
        SetupDiGetDeviceInterfaceDetail(set,ref iface,IntPtr.Zero,0,out required,IntPtr.Zero);
        if(required<8 || required>65536) continue;
        IntPtr detail=Marshal.AllocHGlobal((int)required);
        try {
          Marshal.WriteInt32(detail,IntPtr.Size==8?8:6);
          if(!SetupDiGetDeviceInterfaceDetail(set,ref iface,detail,required,out required,IntPtr.Zero)) continue;
          string devicePath=Marshal.PtrToStringUni(IntPtr.Add(detail,4));
          using(var handle=CreateFile(devicePath,0,3,IntPtr.Zero,3,0,IntPtr.Zero)) {
            if(handle.IsInvalid) continue;
            byte[] hub=new byte[256];
            if(!Query(handle,0x220408,hub)) continue;
            int count=hub[6];
            for(uint port=1; port<=count; port++) {
              byte[] info=new byte[4096]; Put(info,0,port);
              if(!Query(handle,0x220448,info) || BitConverter.ToUInt32(info,31)!=1) continue;
              string speed=null;
              switch(info[23]) { case 0:speed="1.5 Mbps";break;case 1:speed="12 Mbps";break;case 2:speed="480 Mbps";break;case 3:speed="5 Gbps 或更高";break; }
              byte[] v2=new byte[16];Put(v2,0,port);Put(v2,4,16);Put(v2,8,7);
              if(Query(handle,0x22045c,v2)) {
                uint flags=BitConverter.ToUInt32(v2,12);
                if((flags&4)!=0) speed="10 Gbps 或更高"; else if((flags&1)!=0) speed="5 Gbps 或更高";
              }
              byte[] key=new byte[4096];Put(key,0,port);
              if(!Query(handle,0x220420,key)) continue;
              int length=(int)Math.Min(BitConverter.ToUInt32(key,4),4096);
              if(length<=8) continue;
              string driverKey=System.Text.Encoding.Unicode.GetString(key,8,length-8).TrimEnd('\0');
              bool? userConnectable=null, typeC=null; uint? portProperties=null;
              // USB_GET_PORT_CONNECTOR_PROPERTIES = 278, FILE_ANY_ACCESS.
              // usbioctl.h: ConnectionIndex, ActualLength, USB_PORT_PROPERTIES.
              byte[] connector=new byte[4096]; Put(connector,0,port);
              if(Query(handle,0x220458,connector) && BitConverter.ToUInt32(connector,4)>=16) {
                uint flags=BitConverter.ToUInt32(connector,8);
                portProperties=flags; userConnectable=(flags&1)!=0; typeC=(flags&8)!=0;
              }
              if(driverKey.Length>0) result.Add(new Connection { DriverKey=driverKey, Speed=speed, Location="Hub "+(index+1)+" / Port "+port,
                HubPath=devicePath, PortNumber=port, UserConnectable=userConnectable, HostConnectorTypeC=typeC, PortProperties=portProperties, IsHub=info[24]!=0 });
            }
          }
        } finally { Marshal.FreeHGlobal(detail); }
      }
    } finally { SetupDiDestroyDeviceInfoList(set); }
    return result.ToArray();
  }
}
