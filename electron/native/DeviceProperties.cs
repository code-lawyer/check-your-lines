using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

// Read-only SetupAPI / Configuration Manager access. Property keys and types
// follow Microsoft's devpkey.h; no PnP provider startup is needed per device.
public static class CablewiseDevices {
  [StructLayout(LayoutKind.Sequential)] struct DeviceInfo {
    public int Size; public Guid Class; public uint DevInst; public IntPtr Reserved;
  }
  [StructLayout(LayoutKind.Sequential)] struct PropertyKey {
    public Guid Format; public uint Id;
  }
  public class Device {
    public string PNPDeviceID; public string Name; public string Service; public string PNPClass;
    public bool Present=true; public uint? ConfigManagerErrorCode;
    public string[] Children; public string BusDescription; public string ContainerId;
  }
  [DllImport("setupapi.dll",EntryPoint="SetupDiGetClassDevsW",SetLastError=true)]
  static extern IntPtr GetDevices(IntPtr guid,IntPtr enumerator,IntPtr hwnd,uint flags);
  [DllImport("setupapi.dll",SetLastError=true)]
  static extern bool SetupDiEnumDeviceInfo(IntPtr set,uint index,ref DeviceInfo device);
  [DllImport("setupapi.dll")] static extern bool SetupDiDestroyDeviceInfoList(IntPtr set);
  [DllImport("cfgmgr32.dll",CharSet=CharSet.Unicode)]
  static extern uint CM_Get_Device_IDW(uint device,StringBuilder id,uint length,uint flags);
  [DllImport("cfgmgr32.dll")]
  static extern uint CM_Get_DevNode_Status(out uint status,out uint problem,uint device,uint flags);
  [DllImport("cfgmgr32.dll",CharSet=CharSet.Unicode)]
  static extern uint CM_Get_DevNode_PropertyW(uint device,ref PropertyKey key,out uint type,byte[] buffer,ref uint size,uint flags);
  static byte[] Property(uint device,string format,uint id,uint expectedType) {
    var key=new PropertyKey {Format=new Guid(format),Id=id};uint type,size=0;
    CM_Get_DevNode_PropertyW(device,ref key,out type,null,ref size,0);
    if(size==0||size>65536) return null;
    byte[] bytes=new byte[size];
    if(CM_Get_DevNode_PropertyW(device,ref key,out type,bytes,ref size,0)!=0||type!=expectedType||size>bytes.Length) return null;
    Array.Resize(ref bytes,(int)size);return bytes;
  }
  static string Text(uint device,string format,uint id) {
    var data=Property(device,format,id,18);
    return data==null||data.Length%2!=0?null:Encoding.Unicode.GetString(data).TrimEnd('\0');
  }
  public static Device[] Read() {
    const string common="a45c254e-df1c-4efd-8020-67d146a850e0";
    var devices=new List<Device>();
    IntPtr set=GetDevices(IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,6); // PRESENT | ALLCLASSES
    if(set==new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    try {
      for(uint index=0;index<16384;index++) {
        var info=new DeviceInfo {Size=Marshal.SizeOf(typeof(DeviceInfo))};
        if(!SetupDiEnumDeviceInfo(set,index,ref info)) {
          int error=Marshal.GetLastWin32Error();if(error!=259) throw new System.ComponentModel.Win32Exception(error);break;
        }
        var id=new StringBuilder(512);
        if(CM_Get_Device_IDW(info.DevInst,id,(uint)id.Capacity,0)!=0) continue;
        string instance=id.ToString(),service=Text(info.DevInst,common,6),deviceClass=Text(info.DevInst,common,9);
        if(!instance.StartsWith("USB\\",StringComparison.OrdinalIgnoreCase)&&!instance.StartsWith("ACPI\\USBC000",StringComparison.OrdinalIgnoreCase)&&
          (service==null||service.IndexOf("UcmUcsi",StringComparison.OrdinalIgnoreCase)<0)&&!String.Equals(deviceClass,"WPD",StringComparison.OrdinalIgnoreCase)) continue;
        uint status,problem;uint? code=null;
        if(CM_Get_DevNode_Status(out status,out problem,info.DevInst,0)==0) code=(status&0x400)!=0?problem:0;
        byte[] children=Property(info.DevInst,"4340a6c5-93fa-4706-972c-7b648008a5a7",9,0x2012);
        byte[] container=Property(info.DevInst,"8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c",2,13);
        devices.Add(new Device {PNPDeviceID=instance,Service=service,PNPClass=deviceClass,ConfigManagerErrorCode=code,
          Name=Text(info.DevInst,"b725f130-47ef-101a-a5f1-02608c9eebac",10)??Text(info.DevInst,common,14)??Text(info.DevInst,common,2),
          Children=children==null||children.Length%2!=0?new string[0]:Encoding.Unicode.GetString(children).Split(new char[]{'\0'},StringSplitOptions.RemoveEmptyEntries),
          BusDescription=Text(info.DevInst,"540b947e-8b40-45bc-a8a2-6a0b894cbda2",4),
          ContainerId=container!=null&&container.Length==16?new Guid(container).ToString("B"):null});
      }
    } finally {SetupDiDestroyDeviceInfoList(set);}
    return devices.ToArray();
  }
}
