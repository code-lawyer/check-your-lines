const brands = [
  { id: 'apple', name: '苹果', mark: 'A', protocol: 'USB PD', scope: 'USB-C 接口的 iPhone / iPad', color: '#526176', source: 'https://support.apple.com/en-gb/105099', requirement: 'USB-C 线材与支持 USB PD 的充电器；实际功率取决于具体设备。', mode: 'pd', amps: 3 },
  { id: 'samsung', name: '三星', mark: 'S', protocol: 'Super Fast Charging 2.0', scope: '45W 档位的兼容 Galaxy 机型', color: '#2959b6', source: 'https://www.samsung.com/sg/mobile-accessories/45w-power-adapter-black-ep-t4511xbeggb/', requirement: '此规则对应官方 45W 方案：5A USB-C 线、支持 PPS 的充电器和兼容机型。', mode: 'pd', amps: 5 },
  { id: 'xiaomi', name: '小米', mark: 'mi', protocol: 'HyperCharge', scope: '120W Type-A 充电套装', color: '#ed782b', source: 'https://www.mi.com/global/support/faq/details/KA-497000/', requirement: '官方 120W Type-A 套装需要配套原装线；普通 PD 额定功率不足以确认小米 120W 快充。', mode: 'private' },
  { id: 'huawei', name: '华为', mark: 'H', protocol: 'SuperCharge', scope: '66W / 6A 线材方案', color: '#be4d56', source: 'https://consumer.huawei.com/en/accessories/6a-data-cable-usb-a-to-usb-c/', requirement: '官方 66W 方案使用专用 6A A-C 线；USB PD 的 5A 标识不能确认这一私有快充能力。', mode: 'private' },
  { id: 'oppo', name: 'OPPO', mark: 'O', protocol: 'SUPERVOOC', scope: '支持 SUPERVOOC 的 OPPO 机型', color: '#32846b', source: 'https://www.oneplus.com/content/dam/oneplus/2024/eu/store/safety_guide/OnePlus_Magnetic_Cable_Type_C_to_Type_C_User_Guide.pdf', requirement: '需确认 SUPERVOOC 线材身份，并匹配适配器及支持该功能的 OPPO 机型。通用 PD 信息不含此确认。', mode: 'private' },
  { id: 'oneplus', name: '一加', mark: '1+', protocol: 'SUPERVOOC', scope: '支持 SUPERVOOC 的一加机型', color: '#ca4b51', source: 'https://www.oneplus.in/product/product/oneplus-usb-a-to-type-c-cable-10a-1m', requirement: '官方方案要求 SUPERVOOC 适配器及对应数据线；线材的私有快充能力需要单独确认。', mode: 'private' },
  { id: 'vivo', name: 'vivo', mark: 'v', protocol: 'FlashCharge', scope: '具体机型与配套充电方案', color: '#4978cd', source: 'https://www.vivo.com/in/product/productSpecification?id=835', requirement: '官方机型的 FlashCharge 功率依赖匹配充电器。当前读取不到线材的 FlashCharge 身份，无法确认快充兼容。', mode: 'private' }
];

// A cable's chip can establish necessary cable conditions, never the whole
// charger + cable + phone compatibility chain. Do not derive private protocols
// from a high wattage, a USB vendor ID, or a cable's colour.
function compatibility(cable, brand) {
  if (brand.mode === 'private') return { state: 'unknown', label: '专属快充待确认', detail: brand.requirement };
  if (cable.evidence !== 'emarker' || cable.connector !== 'USB-C ↔ USB-C' || !cable.ratingCurrentA || !cable.ratingVoltageV || cable.warnings?.length) {
    return { state: 'unknown', label: '线材条件待确认', detail: '还没有读到足够的线材信息。' + brand.requirement };
  }
  if (cable.ratingCurrentA < brand.amps) return { state: 'limited', label: '未满足此快充方案', detail: `此方案要求 ${brand.amps}A 线材；芯片声明为 ${cable.ratingCurrentA}A。其他充电档位需另行确认。` };
  return { state: 'conditional', label: '线材条件符合', detail: `芯片声明满足此方案的线材电流条件。仍需匹配${brand.id === 'samsung' ? ' PPS ' : ' USB PD '}充电器和具体机型；未进行实际充电测试。` };
}
const rulesReviewedAt = '2026-11-06';
export { brands, compatibility, rulesReviewedAt };
