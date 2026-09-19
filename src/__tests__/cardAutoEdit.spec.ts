import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, reactive } from "vue";
import {
	createRecordState,
	createRuntimeContextState,
	createSchemaMetaState,
	createUiState,
	RECORD_STATE_KEY,
	RUNTIME_CONTEXT_KEY,
	SCHEMA_META_KEY,
	UI_STATE_KEY,
} from "@/composables/instanceState";
import CardView from "@/engine/containers/CardView.vue";
import type { ModuleSchema, RecordEntity } from "@/types";

function makeRecord(
	id: string,
	fields: Record<string, unknown> = {},
): RecordEntity {
	return {
		id,
		moduleId: "module-test",
		fields,
		version: 1,
		createdAt: "",
		updatedAt: "",
	};
}

const schema: ModuleSchema = {
	id: "module-test",
	name: "测试",
	moduleType: "list",
	fields: [
		{ key: "title", label: "标题", type: "text" },
		{ key: "amount", label: "金额", type: "number" },
	],
} as unknown as ModuleSchema;

// 复现 SchemaEngine.handleEditSelectedRow 的确切时序：
// autoEdit 置真 → 切 card 视图（同一次 flush）→ nextTick 复位
describe("CardView autoEdit 时序（select-then-edit 直入编辑）", () => {
	it("同 tick 内 autoEdit=true + 切视图，nextTick 复位后卡片应处于编辑态", async () => {
		const recordStore = createRecordState();
		const uiState = createUiState();
		const schemaMeta = createSchemaMetaState();
		const runtimeContext = createRuntimeContextState({}, []);
		schemaMeta.setSchema(schema);
		schemaMeta.setPermissions({
			view: true,
			create: true,
			edit: true,
			delete: true,
			export: true,
			configure: true,
		});
		const rec = makeRecord("r1", { title: "hello", amount: 1 });
		recordStore.setRecords([rec], 1);

		const state = reactive({ view: "list", autoEdit: false });
		const Host = defineComponent({
			setup() {
				return () =>
					state.view === "card"
						? h(CardView, { editable: true, autoEdit: state.autoEdit })
						: h("div", "list");
			},
		});

		const wrapper = mount(Host, {
			global: {
				provide: {
					[SCHEMA_META_KEY as symbol]: schemaMeta,
					[RECORD_STATE_KEY as symbol]: recordStore,
					[UI_STATE_KEY as symbol]: uiState,
					[RUNTIME_CONTEXT_KEY as symbol]: runtimeContext,
				},
			},
		});

		// act：与 SchemaEngine.handleEditSelectedRow 相同的同步序列
		recordStore.setCurrentRecord(rec);
		state.autoEdit = true;
		state.view = "card";
		await nextTick();
		state.autoEdit = false;
		await nextTick();

		expect(wrapper.find(".schema-card").exists()).toBe(true);
		// 编辑态特征：卡片头部出现 保存/取消 按钮
		expect(wrapper.text()).toContain("保存");
		wrapper.unmount();
	});
});
