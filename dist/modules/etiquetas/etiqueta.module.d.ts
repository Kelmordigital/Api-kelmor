import { type ContactTagger } from './etiqueta.service';
import { AutomaticTagRuleService, type MessageAutoTagger } from './automatic-tag-rule.service';
import { EtiquetaRouter } from './etiqueta.routes';
export declare const automaticTagRuleService: AutomaticTagRuleService;
export declare const etiquetaRouter: EtiquetaRouter;
/** Portas expostas a outros módulos: bot ("adicionar etiqueta") e atendimento (mensagens recebidas). */
export declare const contactTagger: ContactTagger;
export declare const messageAutoTagger: MessageAutoTagger;
//# sourceMappingURL=etiqueta.module.d.ts.map