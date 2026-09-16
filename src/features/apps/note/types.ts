// 笔记数据：每条记录都是一段可自由编辑的文本
export type NoteEntry = {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};
