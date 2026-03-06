import { repoTreeGet } from "../controllers/githubController.js";

const getFolderStructure = () => {
    const repoTree = repoTreeGet(); 
    let folderStruct: any = [];
    repoTree.tree.map((item: any) => {
        folderStruct.push({
            path: item.path,
            type: item.type
        });
    });
    
    return folderStruct;
}

export { getFolderStructure };