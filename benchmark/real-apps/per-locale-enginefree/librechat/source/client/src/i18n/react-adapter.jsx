import {useMemo} from 'react'
import i18n from './index.js'
export function useTranslation(namespace,options={}){const t=useMemo(()=>i18n.getFixedT(i18n.language,namespace||'translation',options.keyPrefix),[namespace,options.keyPrefix]);const result=[t,i18n,true];result.t=t;result.i18n=i18n;result.ready=true;return result}
export {Trans} from './trans.jsx'
export const initReactI18next={type:'3rdParty',init(){}}
