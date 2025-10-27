interface MetadataSectionProps {
  metadataType?: string;
  onChange: (type: string) => void;
}

export default function MetadataSection({
  metadataType,
  onChange,
}: MetadataSectionProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 shadow-sm">
      <div className="font-semibold text-sm mb-2">🏷️ 메타데이터 설정</div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-600">타입:</label>
        <select
          value={metadataType || ""}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="">선택 안 함</option>
          <option value="slot">Slot</option>
          <option value="default">Default</option>
        </select>
      </div>
    </div>
  );
}
