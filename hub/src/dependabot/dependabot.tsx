import * as SDK from "azure-devops-extension-sdk";
import { getClient } from "azure-devops-extension-api";
import { BuildRestClient } from "azure-devops-extension-api/Build";
import { Page } from "azure-devops-ui/Page";
import { ZeroData } from "azure-devops-ui/ZeroData";
import * as React from "react";
import * as ReactDOM from "react-dom";

import "./dependabot.scss";

import { Header } from "azure-devops-ui/Header";

import { showRootComponent } from "../Common";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { Card } from "azure-devops-ui/Card";
import { Table } from "azure-devops-ui/Table";

import {
    ColumnMore,
    ColumnSelect,
    ISimpleTableCell,
    renderSimpleCell,
    TableColumnLayout,
} from "azure-devops-ui/Table";
import { ObservableValue } from "azure-devops-ui/Core/Observable";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";

interface ITableItem extends ISimpleTableCell {
    name: string;
    version: string;
    type: string;
    referencedBy: string;
}

const fixedColumns = [
    {
        columnLayout: TableColumnLayout.singleLinePrefix,
        id: "name",
        name: "Dependency Name",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-30),
    },
    {
        id: "version",
        name: "Version",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-30),
    },
    {
        columnLayout: TableColumnLayout.none,
        id: "type",
        name: "Type",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-40),
    },
    {
        columnLayout: TableColumnLayout.none,
        id: "referencedBy",
        name: "Referenced By Project(s)",
        readonly: true,
        renderCell: renderSimpleCell,
        width: new ObservableValue(-40),
    },
];

const dependencyList = {
    "dependencies": [
      {
        "name": "Microsoft.Extensions.Configuration.Binder",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Microsoft.Extensions.DependencyModel",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Microsoft.Extensions.Logging.Abstractions",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Microsoft.Extensions.Options",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Serilog",
        "requirements": [],
        "version": "3.1.1"
      },
      {
        "name": "Serilog.AspNetCore",
        "requirements": [
          {
            "file": "/WebApplicationNetCore/WebApplicationNetCore.csproj",
            "groups": ["dependencies"],
            "requirement": "8.0.1",
            "source": null
          }
        ],
        "version": "8.0.1"
      },
      {
        "name": "Serilog.Extensions.Hosting",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Serilog.Extensions.Logging",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Serilog.Formatting.Compact",
        "requirements": [],
        "version": "2.0.0"
      },
      {
        "name": "Serilog.Settings.Configuration",
        "requirements": [],
        "version": "8.0.0"
      },
      {
        "name": "Serilog.Sinks.Console",
        "requirements": [],
        "version": "5.0.0"
      },
      {
        "name": "Serilog.Sinks.Debug",
        "requirements": [],
        "version": "2.0.0"
      },
      {
        "name": "Serilog.Sinks.File",
        "requirements": [],
        "version": "5.0.0"
      },
      {
        "name": "System.Text.Json",
        "requirements": [],
        "version": "8.0.0"
      }
    ],
    "dependency_files": ["/WebApplicationNetCore/WebApplicationNetCore.csproj", "/WebApplicationNetCore/nuget.config"]
  };  

 const tableItemsNoIcons = new ArrayItemProvider<ITableItem>(
    dependencyList.dependencies.map(x => {
        return {
            name: x.name,
            version: x.version,
            type: x.requirements.length > 0 ? "Top-Level" : "Transitive",
            referencedBy: x.requirements.map(r => r.file).join(", ")
        }
    })
);

class DependencyList extends React.Component<{}, { artifactContext?: string, debugInfo?: string }> {
    constructor(props: {}) {
        super(props);
        this.state = { artifactContext: undefined, debugInfo: undefined };
    }

    public async componentDidMount() {
        await SDK.init();
        const projectName = "Dependabot";
        const buildId = 388;
        const artifactName = "update-0-nuget-all-dependency-list.json";

        try {
            const buildClient = await getClient(BuildRestClient);
            const artifact = await buildClient.getArtifactContentZip(projectName, buildId, artifactName);
            if (artifact) {
                this.setState({
                    artifactContext: JSON.stringify(artifact, null, 2),
                    debugInfo: "Artifact was successfully retrieved."
                });
            } else {
                this.setState({
                    artifactContext: "No artifact was returned.",
                    debugInfo: "No artifact found with the specified name."
                });
            }
        } catch (error) {
            console.error("Error fetching artifact:", error);
            this.setState({
                artifactContext: `Error fetching artifact: ${error}`,
                debugInfo: `API call failed: ${error}`
            });
        }
    }

    public render(): JSX.Element {
        const { artifactContext, debugInfo } = this.state;

        return (
            <div className="dependabot flex-grow">
                <Card className="flex-grow bolt-table-card" contentProps={{ contentPadding: false }}>
                    <Table
                        ariaLabel="Basic Table"
                        columns={fixedColumns}
                        itemProvider={tableItemsNoIcons}
                        role="table"
                        className="table-example"
                        containerClassName="h-scroll-auto"
                    />
                </Card>
                {!artifactContext && (
                    <ZeroData
                        primaryText="Fetching artifact..."
                        secondaryText={"Please wait while the artifact is being fetched."}
                        imageAltText=""
                    />
                )}
                {artifactContext && (
                     <div>
                        <h3>Artifact Information:</h3>
                        <pre>{artifactContext}</pre>
                    </div>
                )}
                {debugInfo && (
                    <div>
                        <h3>Debug Information:</h3>
                        <pre>{debugInfo}</pre>
                    </div>
                )}
            </div>
        );
    }
}

interface IDependabotHub { 
    projectContext: any;
}

class DependabotHub extends React.Component<{}, IDependabotHub> {   

    constructor(props: {}) {
        super(props);
        this.state = { projectContext: undefined };  
    }

    public componentDidMount() {
        try {        
            console.log("Component did mount, initializing SDK...");
            SDK.init();
            
            SDK.ready().then(() => {
                console.log("SDK is ready, loading project context...");
                this.loadProjectContext();
            }).catch((error) => {
                console.error("SDK ready failed: ", error);
            });
        } catch (error) {
            console.error("Error during SDK initialization or project context loading: ", error);
        }
    }

    public render(): JSX.Element {
        return (
            <Page className="dependabot-hub flex-grow">
                <Header title="Dependabot - Dependency Graph" />
                <div className="page-content">
                    <DependencyList>
                    </DependencyList>
                </div>
            </Page>
        );
    }   

    private async loadProjectContext(): Promise<void> {
        try {            
            const client = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
            const context = await client.getProject();
            
            this.setState({ projectContext: context });            

            SDK.notifyLoadSucceeded();
        } catch (error) {
            console.error("Failed to load project context: ", error);
        }
    }
}

showRootComponent(<DependabotHub />);
