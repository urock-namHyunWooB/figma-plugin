import fs from "fs";
import path from "path";
import FigmaCompiler from "./src/frontend/ui/domain/compiler";

async function compileLarge() {
  const jsonPath = "./test/fixtures/failing/Large.json";
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  
  console.log("Compiling Large component...");
  
  const compiler = new FigmaCompiler(jsonData, {
    styleStrategy: { type: "emotion" },
  });
  
  const componentName = compiler.getComponentName();
  console.log("Component name:", componentName);
  
  const props = compiler.getPropsDefinition();
  console.log("Props:", props.map(p => `${p.name}: ${p.type}`).join(", "));
  
  const code = await compiler.getGeneratedCode(componentName);
  
  // compiled 폴더 생성
  const outputDir = path.join("./test/fixtures/failing/compiled");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // tsx 파일로 저장
  const outputPath = path.join(outputDir, `${componentName}.tsx`);
  fs.writeFileSync(outputPath, code, "utf8");
  
  console.log(`✅ Compiled to: ${outputPath}`);
  console.log("\n--- Generated Code Preview ---");
  console.log(code.substring(0, 1000) + "...");
}

compileLarge().catch(console.error);
