// A thin wrapper preserves instance/type identity across import and require.
import Constant from './index.js';
export const defineType = Constant.defineType;
export const defineEnum = Constant.defineEnum;
export { Constant };
export default Constant;
